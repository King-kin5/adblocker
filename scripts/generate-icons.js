const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outputDir = path.join(__dirname, '../public/icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Create a simple icon with text
const createIcon = async (size) => {
    const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#4285f4"/>
            <text x="50%" y="50%" font-family="Arial" font-size="${size/2}px" 
                  fill="white" text-anchor="middle" dominant-baseline="middle">AB</text>
        </svg>
    `;
    
    return sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outputDir, `icon${size}.png`));
};

// Generate icons for each size
Promise.all(sizes.map(size => 
    createIcon(size)
        .then(() => console.log(`Generated ${size}x${size} icon`))
        .catch(err => console.error(`Error generating ${size}x${size} icon:`, err))
));