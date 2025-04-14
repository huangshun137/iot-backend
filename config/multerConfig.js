const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 确保上传目录存在
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // 保存到uploads目录
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

// 文件过滤（可选）
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/x-compressed'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 100 }, // 限制100MB
  fileFilter: fileFilter
});

module.exports = upload;