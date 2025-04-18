const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Device = require('../models/Device');
const Property = require('../models/Property');
const Command = require('../models/Command');
const asyncHandler = require('express-async-handler');

// 统一创建/更新接口
router.post('/', asyncHandler(async (req, res) => {
  const { _id, ...data } = req.body;

  if (_id) {
    // 更新逻辑
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error('无效的产品ID');
      error.status = 400;
      throw error;
    }

    const existingProduct = await Product.findById(_id);
    if (!existingProduct) {
      const error = new Error('未找到该产品');
      error.status = 404;
      throw error;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      _id,
      data,
      { new: true, runValidators: true }
    );
    
    res.status(200).json(updatedProduct);
  } else {
    // 新建逻辑
    const newProduct = await Product.create(data);
    res.status(201).json(newProduct);
  }
}));

// 获取所有产品
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      isDeleted: false
    };
    if (status) {
      query.status = status;
    }
    const products = await Product.find(query);
    res.status(200).json(products);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 获取单个产品详情
router.get('/:id', asyncHandler(async (req, res) => {
  const productId = req.params.id;

  // 验证ID格式
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('无效的产品ID格式');
    error.statusCode = 400;
    throw error;
  }

  // 查询数据库
  const product = await Product.findById(productId);

  // 处理未找到情况
  if (!product || product.isDeleted) {
    const error = new Error('未找到指定产品');
    error.statusCode = 500;
    throw error;
  }

  // 返回标准化响应
  res.status(200).json(product);
}));

// 删除产品及关联设备
router.delete('/:id', asyncHandler(async (req, res) => {
  const productId = req.params.id;

  // 验证ID格式
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('无效的产品ID');
    error.status = 400;
    throw error; // 直接抛出错误
  }

  // 查找并删除产品
  const deletedProduct = await Product.findById(productId);
  if (!deletedProduct) {
    const error = new Error('未找到该产品');
    error.status = 404;
    throw error;
  }
  deletedProduct.isDeleted = true;
  await deletedProduct.save();

  // 级联删除关联设备
  await Device.updateMany(
    { product: productId },
    { isDeleted: true }
  );
  // 级联删除关联属性
  await Property.deleteMany({ product: productId });
  // 级联删除关联命令
  await Command.deleteMany({ product: productId });

  res.json({ 
    message: '产品及关联设备已删除',
    deletedProductId: productId
  });
}));

module.exports = router;