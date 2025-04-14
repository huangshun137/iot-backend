const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Property = require('../models/Property');
const asyncHandler = require('express-async-handler');

// 创建属性（需要关联产品）
router.post('/', asyncHandler(async (req, res) => {
  const { _id, productId, ...data } = req.body;

  if (_id) {
    // 更新属性
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error('无效的属性ID');
      error.status = 400;
      throw error;
    }

    const existingProperty = await Property.findById(_id);
    if (!existingProperty) {
      const error = new Error('未找到该属性');
      error.status = 500;
      throw error;
    }

    // 如果传了新的 productId，验证其有效性
    if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('无效的产品ID');
      error.status = 400;
      throw error;
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      _id,
      { ...data, product: productId || existingProperty.product },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedProperty);
  } else {
    // 新建设备（必须传 productId）
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('需要有效的产品ID');
      error.status = 400;
      throw error;
    }

    const newProperty = await Property.create({
      ...data,
      product: productId
    });

    res.status(201).json(newProperty);
  }
}));

// 获取属性列表（包含关联产品信息）
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { productId } = req.query; // 获取查询参数中的 productId
    let query = {};

    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        const error = new Error('无效的产品ID');
        error.status = 400;
        throw error;
      }
      query.product = productId; // 设置查询条件
    }

    const properties = await Property.find(query);
    res.json(properties);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 删除单个属性
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const propertyId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      const error = new Error('无效的属性ID');
      error.status = 400;
      throw error; // 直接抛出错误
    }

    const deletedProperty = await Property.findByIdAndDelete(propertyId);
    if (!deletedProperty) {
      const error = new Error('未找到该属性');
      error.status = 500;
      throw error;
    }

    res.json({ 
      message: '属性已删除',
      deletedDeviceId: propertyId
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = err.status || 500;
    throw error;
  }
}));

module.exports = router;