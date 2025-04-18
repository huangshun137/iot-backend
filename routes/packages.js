const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Package = require('../models/Package');
const OTATask = require('../models/OTATask');
const upload = require('../config/multerConfig');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const fs = require('fs');
const fsPromise = require('fs').promises; // 使用Promise版本的文件操作
const path = require('path');

// 计算文件MD5
function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// 统一创建/更新接口
router.post('/', upload.single('file') , asyncHandler(async (req, res) => {
  const { _id, productId, md5, file, ...data } = req.body;

  if (_id) {
    // 更新逻辑
    // if (!mongoose.Types.ObjectId.isValid(_id)) {
    //   const error = new Error('无效的资源包ID');
    //   error.status = 400;
    //   throw error;
    // }

    // const existingPackage = await Package.findById(_id);
    // if (!existingPackage) {
    //   const error = new Error('未找到该资源包');
    //   error.status = 404;
    //   throw error;
    // }

    // const updatedPackage = await Package.findByIdAndUpdate(
    //   _id,
    //   data,
    //   { new: true, runValidators: true }
    // );
    
    // res.status(200).json(updatedPackage);
  } else {
    // 新建逻辑
    if (!req.file) return res.status(400).send('无文件上传');

    // 计算服务端MD5
    const serverMd5 = await calculateMD5(req.file.path);
    // 校验MD5
    if (serverMd5 !== md5) {
      await fsPromise.access(req.file.path); // 检查文件是否存在
      await fsPromise.unlink(req.file.path); // 删除无效文件
      return res.status(422).send('MD5校验失败');
    }

    // 上传文件，保存文件路径（相对路径）
    const _data = {
      ...data,
      product: productId,
      filePath: path.relative(process.cwd(), req.file.path),
      size: req.file.size,
      md5: serverMd5
    }
    const newPackage = await Package.create(_data);
    res.status(201).json(newPackage);
  }
}));

// 获取所有产品
router.get('/', asyncHandler(async (req, res) => {
  try {
    // const { status } = req.query;
    const query = { isDeleted: false };
    // if (status) {
    //   query.status = status;
    // }
    const packages = await Package.find(query).populate('product');
    res.status(200).json(packages);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 获取单个产品详情
router.get('/:id', asyncHandler(async (req, res) => {
  const packageId = req.params.id;

  // 验证ID格式
  if (!mongoose.Types.ObjectId.isValid(packageId)) {
    const error = new Error('无效的ID格式');
    error.statusCode = 400;
    throw error;
  }

  // 查询数据库
  const package = await Package.findById(packageId);

  // 处理未找到情况
  if (!package) {
    const error = new Error('未找到指定资源包');
    error.statusCode = 500;
    throw error;
  }

  // 返回标准化响应
  res.status(200).json(package);
}));

// 下载接口
router.get('/download/:id', asyncHandler(async (req, res) => {
  try {
    const packageId = req.params.id;
    const package = await Package.findById(packageId);
    if (!package || package.isDeleted) return res.status(500).json('文件不存在');

    // 实时计算MD5
    const filePath = path.resolve(
      process.cwd(),
      package.filePath
    );
    const currentMd5 = await calculateMD5(filePath);
    
    // 校验文件完整性
    if (currentMd5 !== package.md5) {
      return res.status(500).json('文件已损坏');
    }

    // 发送文件
    const ext = path.extname(filePath);
    res.download(filePath, package.name + ext, {
      headers: {
        'Content-MD5': Buffer.from(currentMd5).toString('base64')
      }
    });
  } catch (err) {
    // const error = new Error(err.message);
    // error.status = 500;
    // throw error;
    res.status(500).json({ error: err.message });
  }
}));

// 删除资源包记录及文件
router.delete('/:id', asyncHandler(async (req, res) => {
  // 1. 查找文档记录
  const package = await Package.findById(req.params.id);
  if (!package) {
    return res.status(500).json({ error: '文档不存在' });
  }

  // 2. 判断是否有正在执行的任务
  const otaTask = await OTATask.findOne({
    package: package._id,
    status: { $in: ['pending', 'running'] }
  });
  if (otaTask) {
    return res.status(500).json({ error: '资源包正在被使用，无法删除' });
  }

  // 2. 获取文件路径（处理不同存储方式）
  const filePath = path.resolve(
    process.cwd(),
    package.filePath
  );

  // 3. 删除文件
  try {
    await fsPromise.access(filePath); // 检查文件是否存在
    await fsPromise.unlink(filePath); // 执行删除
  } catch (fileError) {
    if (fileError.code === 'ENOENT') {
      console.warn('文件不存在，继续删除数据库记录');
    } else {
      throw fileError;
    }
  }

  package.isDeleted = true;
  // 4. 删除数据库记录(逻辑删除)
  await package.save();

  res.json({
    message: '删除成功',
    deletedId: package._id
  });
}));

module.exports = router;