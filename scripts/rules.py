import os
import json
import re
import argparse
import urllib.request
import hashlib
from datetime import datetime
from typing import Dict, List, Set, Optional, Any, Union

# Default filter lists
DEFAULT_FILTER_LISTS = [
    "https://easylist.to/easylist/easylist.txt",
    "https://easylist.to/easylist/easyprivacy.txt",
    "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext",
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
]

# Maximum number of rules Chrome supports (currently limited to 50,000)
MAX_RULES = 50000

# Rule types
BLOCK = "block"
REDIRECT = "redirect"
ALLOW = "allow"
UPGRADE_SCHEME = "upgradeScheme"
MODIFY_HEADERS = "modifyHeaders"

# Resource types
RESOURCE_TYPES = [
    "main_frame", "sub_frame", "stylesheet", "script", "image", "font",
    "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "other"
]

class FilterProcessor:
    """Process filter lists into Chrome compatible declarativeNetRequest rules"""
    
    def __init__(self, output_file: str = "../public/rules.json"):
        self.output_file = output_file
        self.rules: List[Dict[str, Any]] = []
        self.rule_ids: Set[int] = set()
        self.domain_regex = re.compile(r'^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+$')
        self.comment_regex = re.compile(r'^\s*[!#]')
        self.element_hiding_regex = re.compile(r'##|#@#|#\?#')
        self.next_id = 1  # Start rule IDs at 1
    
    def _generate_rule_id(self, rule_text: str) -> int:
        """Generate a unique sequential rule ID"""
        # Simply increment the ID for each rule
        rule_id = self.next_id
        self.next_id += 1
        self.rule_ids.add(rule_id)
        return rule_id
    
    def _parse_adblock_filter(self, filter_text: str) -> Optional[Dict[str, Any]]:
        """Parse an AdBlock Plus filter line into a Chrome declarativeNetRequest rule"""
        # Skip comments, empty lines, and element hiding rules
        if not filter_text or self.comment_regex.match(filter_text) or self.element_hiding_regex.search(filter_text):
            return None
        
        # Handle exception rules (whitelist)
        is_exception = filter_text.startswith('@@')
        if is_exception:
            filter_text = filter_text[2:]
            action_type = ALLOW
        else:
            action_type = BLOCK
        
        # Extract options if present
        options = {}
        domains = []
        excluded_domains = []
        resource_types = []
        
        if '$' in filter_text:
            filter_pattern, options_text = filter_text.split('$', 1)
            for option in options_text.split(','):
                if option.startswith('domain='):
                    domain_list = option[7:].split('|')
                    for domain in domain_list:
                        if domain.startswith('~'):
                            excluded_domains.append(domain[1:])
                        else:
                            domains.append(domain)
                elif '=' in option:
                    key, value = option.split('=', 1)
                    options[key] = value
                elif option.startswith('~'):
                    # Handle negated options
                    if option[1:] in RESOURCE_TYPES:
                        # Skip negated resource types for now - would need to convert to excludedResourceTypes
                        pass
                else:
                    if option == 'third-party':
                        options['third-party'] = True
                    elif option == 'first-party':
                        options['first-party'] = True
                    elif option in RESOURCE_TYPES:
                        resource_types.append(option)
        else:
            filter_pattern = filter_text
        
        # Convert Adblock pattern to a URL filter
        url_filter = self._convert_to_url_filter(filter_pattern)
        if not url_filter:
            return None
        
        # Create the rule
        rule = {
            "id": self._generate_rule_id(filter_text),
            "priority": 1,  # Default priority
            "action": {"type": action_type},
            "condition": {
                "urlFilter": url_filter,
                "resourceTypes": resource_types if resource_types else RESOURCE_TYPES
            }
        }
        
        # Add domain conditions if specified
        if domains:
            rule["condition"]["domains"] = domains
        if excluded_domains:
            rule["condition"]["excludedDomains"] = excluded_domains
            
        return rule
    
    def _convert_to_url_filter(self, pattern: str) -> Optional[str]:
        """Convert AdBlock filter pattern to Chrome's URL filter format"""
        # Handle empty patterns
        if not pattern:
            return None
            
        # Handle domain-specific patterns (e.g., ||example.com^)
        if pattern.startswith('||'):
            domain = pattern[2:]
            # Convert domain anchors
            if domain.endswith('^'):
                domain = domain[:-1]
            # Basic conversion - this doesn't handle all Adblock syntax nuances
            return '*://' + domain + '*'
            
        # Handle start-of-address patterns (e.g., |http://example.com)
        if pattern.startswith('|'):
            return pattern[1:] + '*'
            
        # Handle end-of-address patterns (e.g., example.com|)
        if pattern.endswith('|'):
            return '*' + pattern[:-1]
            
        # Handle wildcards - they're already represented the same way in Chrome's urlFilter
        
        # Handle caret as separator (e.g., example.com^)
        pattern = pattern.replace('^', '*')
            
        # Default case - add wildcards at both ends
        return '*' + pattern + '*'
        
    def _parse_hosts_file(self, line: str) -> Optional[Dict[str, Any]]:
        """Parse a hosts file line into a declarativeNetRequest rule"""
        # Skip comments and empty lines
        if not line or line.startswith('#'):
            return None
        
        # Extract the domain part from a hosts file line
        parts = line.strip().split()
        if len(parts) < 2:
            return None
            
        # Typical format is: 127.0.0.1 domain.com
        if parts[0] in ('127.0.0.1', '0.0.0.0', '::1'):
            domain = parts[1]
            
            # Validate domain format
            if not self.domain_regex.match(domain):
                return None
                
            # Create blocking rule
            return {
                "id": self._generate_rule_id(line),
                "priority": 1,
                "action": {"type": BLOCK},
                "condition": {
                    "urlFilter": f"*://{domain}/*",
                    "resourceTypes": RESOURCE_TYPES
                }
            }
        
        return None
        
    def process_filter_list(self, url: str) -> None:
        """Process a filter list from URL and add valid rules"""
        try:
            print(f"Downloading filter list from: {url}")
            response = urllib.request.urlopen(url)
            content = response.read().decode('utf-8', errors='ignore')
            
            for line in content.splitlines():
                line = line.strip()
                
                # Process based on the list type
                if url.endswith('.txt'):
                    rule = self._parse_adblock_filter(line)
                elif 'hosts' in url:
                    rule = self._parse_hosts_file(line)
                else:
                    # Try both formats
                    rule = self._parse_adblock_filter(line) or self._parse_hosts_file(line)
                
                if rule:
                    self.rules.append(rule)
                    
                # Check if we've reached the maximum number of rules
                if len(self.rules) >= MAX_RULES:
                    print(f"Warning: Reached maximum rule limit of {MAX_RULES}. Stopping.")
                    break
                    
        except Exception as e:
            print(f"Error processing list {url}: {e}")
    
    def process_custom_filter(self, filter_text: str) -> Optional[Dict[str, Any]]:
        """Process a single custom filter line"""
        if not filter_text or filter_text.isspace() or self.comment_regex.match(filter_text):
            return None
            
        # Try to parse as AdBlock filter or hosts file
        rule = self._parse_adblock_filter(filter_text) or self._parse_hosts_file(filter_text)
        
        if rule:
            self.rules.append(rule)
            return rule
        return None
    
    def save_rules(self) -> None:
        """Save processed rules to the output file in Chrome's declarativeNetRequest format"""
        # Ensure the output directory exists
        os.makedirs(os.path.dirname(self.output_file), exist_ok=True)
        
        # Deduplicate rules based on URL filter to reduce size
        unique_rules = {}
        for rule in self.rules:
            url_filter = rule["condition"]["urlFilter"]
            # Keep the rule with higher priority if duplicates exist
            if url_filter not in unique_rules or unique_rules[url_filter]["priority"] < rule["priority"]:
                unique_rules[url_filter] = rule
        
        final_rules = list(unique_rules.values())
        
        # Limit to 5000 rules for Chrome's dynamic rules limit
        final_rules = final_rules[:5000]
        
        # Note: No longer reassigning IDs here - using the ones already assigned
        print(f"Trimming to {len(final_rules)} rules to meet Chrome's limit")
        
        # Save rules as a direct array (Chrome's required format)
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(final_rules, f, indent=2)
            
        print(f"Saved {len(final_rules)} rules to {self.output_file}")


def main():
    parser = argparse.ArgumentParser(description='Process filter lists into Chrome compatible rules')
    parser.add_argument('--output', '-o', default='../public/rules.json', help='Output JSON file')
    parser.add_argument('--lists', '-l', nargs='+', help='URLs of filter lists to process')
    parser.add_argument('--custom', '-c', default='custom-filters.txt', help='Path to custom filters file')
    
    args = parser.parse_args()
    
    processor = FilterProcessor(output_file=args.output)
    
    # Process default and specified lists
    filter_lists = args.lists if args.lists else DEFAULT_FILTER_LISTS
    for url in filter_lists:
        processor.process_filter_list(url)
    
    # Process custom filters if provided
    if args.custom and os.path.exists(args.custom):
        print(f"Processing custom filters from {args.custom}")
        with open(args.custom, 'r', encoding='utf-8') as f:
            content = f.read()
            for line in content.splitlines():
                if line.strip() and not line.strip().startswith('#'):
                    processor.process_custom_filter(line.strip())
    
    processor.save_rules()


if __name__ == "__main__":
    main()