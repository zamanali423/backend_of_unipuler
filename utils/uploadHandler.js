const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

const upload = multer({ dest: "uploads/" });

function parseCSV(filePath, callback) {
  const results = [];
  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {
      callback(null, results);
      fs.unlinkSync(filePath); // Clean up uploaded file
    })
    .on("error", (error) => callback(error));
}

module.exports = { upload, parseCSV };


