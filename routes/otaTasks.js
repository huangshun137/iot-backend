const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DeviceOTA = require('../models/DeviceOTA');
const OTATask = require('../models/OTATask');
const asyncHandler = require('express-async-handler');

const { checkAndUpdateOTAStatus } = require('../config/mqtt');

// 创建任务接口
router.post('/', asyncHandler(async (req, res) => {
  // 新建逻辑
  const { packageId, deviceIdList, _id, ...data } = req.body;
  if (!packageId || !mongoose.Types.ObjectId.isValid(packageId)) {
    const error = new Error('需要有效的资源包ID');
    error.status = 400;
    throw error;
  }
  if (!deviceIdList || deviceIdList.some((item) => !mongoose.Types.ObjectId.isValid(item))) {
    const error = new Error('需要有效的设备ID');
    error.status = 400;
    throw error;
  }
  const deviceIds = deviceIdList.map(item => new mongoose.Types.ObjectId(item));
  const deviceOtaList = await DeviceOTA.find({ _id: { $in: deviceIds }, status: { $in: ['pending', 'running'] } });
  if (deviceOtaList.length > 0) {
    const error = new Error('存在正在执行任务的设备');
    error.status = 400;
    throw error;
  }
  const newOTATask = await OTATask.create({
    ...data,
    package: packageId,
    deviceList: deviceIdList
  });
  await DeviceOTA.insertMany(deviceIdList.map((item) => {
    return {
      device: item,
      otaTask: newOTATask._id,
      status: 'pending',
      description: '查询版本中'
    }
  }));
  res.status(201).json(newOTATask);
}));

// 获取所有任务
router.get('/', asyncHandler(async (req, res) => {
  try {
    // const { status } = req.query;
    const query = {};
    // if (status) {
    //   query.status = status;
    // }
    const _OTATask = await OTATask.find(query).populate('package').populate('deviceList');
    res.status(200).json(_OTATask);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 获取单个任务详情
router.get('/:id', asyncHandler(async (req, res) => {
  const OTATaskId = req.params.id;

  // 验证ID格式
  if (!mongoose.Types.ObjectId.isValid(OTATaskId)) {
    const error = new Error('无效的ID格式');
    error.statusCode = 400;
    throw error;
  }

  // 查询数据库
  const _OTATask = await Package.findById(OTATaskId);

  // 处理未找到情况
  if (!_OTATask) {
    const error = new Error('未找到指定任务');
    error.statusCode = 500;
    throw error;
  }

  // 返回标准化响应
  res.status(200).json(_OTATask);
}));

// 删除任务
router.delete('/:id', asyncHandler(async (req, res) => {
  // 1. 查找文档记录
  const _OTATask = await OTATask.findById(req.params.id);
  if (!_OTATask) {
    return res.status(500).json({ error: '任务不存在' });
  }

  // 4. 删除数据库记录
  await _OTATask.deleteOne();

  res.json({
    message: '删除成功',
    deletedId: _OTATask._id
  });
}));

// 重试任务
router.post('/retry/:id', asyncHandler(async (req, res) => {
  try {
    // 查找DeviceOTA记录
    const _DeviceOTATask = await DeviceOTA.findById(req.params.id);
    if (!_DeviceOTATask) {
      return res.status(500).json({ error: '任务不存在' });
    }

    _DeviceOTATask.status = 'pending';
    _DeviceOTATask.description = '查询版本中';
    _DeviceOTATask.path = '';
    await _DeviceOTATask.save();

    // 判断是否更新OTA任务状态
    checkAndUpdateOTAStatus(_DeviceOTATask);

    res.status(200).json({
      message: '重试成功',
      id: _DeviceOTATask._id
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 重试任务
router.post('/stop/:id', asyncHandler(async (req, res) => {
  try {
    // 查找DeviceOTA记录
    const _DeviceOTATask = await DeviceOTA.findById(req.params.id);
    if (!_DeviceOTATask) {
      return res.status(500).json({ error: '任务不存在' });
    }

    // TODO 判断设备端是否在执行中，执行中需要等待设备端终止任务
    _DeviceOTATask.status = 'canceled';
    _DeviceOTATask.description = '';
    _DeviceOTATask.path = '';
    await _DeviceOTATask.save();
    
    // 判断是否更新OTA任务状态
    checkAndUpdateOTAStatus(_DeviceOTATask);

    res.status(200).json({
      message: '停止成功',
      id: _DeviceOTATask._id
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

module.exports = router;