const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DeviceOTA = require('../models/DeviceOTA');
const OTATask = require('../models/OTATask');
const Package = require('../models/Package');
const Device = require('../models/Device');
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
router.post('/retry', asyncHandler(async (req, res) => {
  try {
    const { packageId, id } = req.body;
    // 判断资源包是否被删除
    const _package = await Package.findById(packageId);
    if (!_package) {
      return res.status(500).json({ error: '资源包不存在' });
    }
    if (_package.isDeleted) {
      return res.status(500).json({ error: '资源包已被删除' });
    }
    // 查找DeviceOTA记录
    const _DeviceOTATask = await DeviceOTA.findById(id);
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

// 停止单个设备OTA任务
router.post('/stop/:id', asyncHandler(async (req, res) => {
  try {
    // 查找DeviceOTA记录
    const _DeviceOTATask = await DeviceOTA.findById(req.params.id);
    if (!_DeviceOTATask) {
      return res.status(500).json({ error: '任务不存在' });
    }

    if (_DeviceOTATask.status === 'running') {
      _DeviceOTATask.status = 'stopping';
      _DeviceOTATask.description = '正在停止中';
      await _DeviceOTATask.save();

      // 发布mqtt 通知设备端停止升级
      const device = await Device.findById(_DeviceOTATask.device);
      if (device) {
        const topic = `/devices/${device.deviceId}/sys/messages/down`;
        const payload = JSON.stringify({
          type: "OTA",
          stop: true
        });
        console.log(`[OTA] 发布mqtt 通知设备端停止升级 ${device.deviceId}`);
        req.app.mqttClient.publish(topic, payload, { qos: 1 });
      }
    } else {
      _DeviceOTATask.status = 'canceled';
      _DeviceOTATask.description = '';
      _DeviceOTATask.path = '';
      await _DeviceOTATask.save();
    }

    // 判断是否更新OTA任务状态
    checkAndUpdateOTAStatus(_DeviceOTATask);

    res.status(200).json({
      message: '操作成功',
      id: _DeviceOTATask._id
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 停止整个任务
router.post('/stopTask/:id', asyncHandler(async (req, res) => {
  try {
    // 查找OTATask记录
    const _OTATask = await OTATask.findById(req.params.id);
    if (!_OTATask) {
      return res.status(500).json({ error: '任务不存在' });
    }

    const updatePendingDeviceOtas = await DeviceOTA.updateMany(
      { otaTask: _OTATask._id, status: 'pending' },
      { $set: { status: 'canceled', description: '', path: '' }
    });
    const runningDeviceOtas = await DeviceOTA.find({ otaTask: _OTATask._id, status: 'running' });
    if (runningDeviceOtas.length > 0) {
      runningDeviceOtas.forEach(async item => {
        item.status = 'stopping';
        item.description = '正在停止中';;
        await item.save();

        // 发布mqtt 通知设备端停止升级
        const device = await Device.findById(item.device);
        if (device) {
          const topic = `/devices/${device.deviceId}/sys/messages/down`;
          const payload = JSON.stringify({
            type: "OTA",
            stop: true
          })
          console.log(`[OTA] 发布mqtt 通知设备端停止升级 ${device.deviceId}`);
          req.app.mqttClient.publish(topic, payload, { qos: 1 });
        }
      })
    }

    if (updatePendingDeviceOtas.modifiedCount > 0 || runningDeviceOtas.length > 0) {
      // 更新OTA任务状态
      let status = 'canceled';
      if (runningDeviceOtas.length > 0) {
        status = 'stopping';
      }
      _OTATask.status = status;
      await _OTATask.save();
    }

    res.status(200).json({
      message: '操作成功',
      id: _OTATask._id
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

module.exports = router;