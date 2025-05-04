const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AgentDevice = require('../models/AgentDevice');
const Device = require('../models/Device');
const asyncHandler = require('express-async-handler');

// 创建绑定设备
router.post('/', asyncHandler(async (req, res) => {
  const { _id, deviceId, ...data } = req.body;

  if (_id) {
    // 更新设备
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error('无效ID');
      error.status = 400;
      throw error;
    }

    const existingDevice = await AgentDevice.findById(_id);
    if (!existingDevice) {
      const error = new Error('未找到该设备');
      error.status = 404;
      throw error;
    }
    const agentDevice = await Device.findById(data.agentId);
    if (!agentDevice) {
      const error = new Error('未找到对应的Agent设备');
      error.status = 404;
      throw error;
    }

    const updatedDevice = await AgentDevice.findOneAndUpdate(
      { _id: _id },
      { ...data, device: deviceId || existingDevice.device },
      { new: true, runValidators: true }
    ).populate('device');

    // 修改后通知agent端做对应的mqtt监听变更
    req.app.mqttClient.publish(`/devices/${agentDevice.deviceId}/sys/messages/down`, JSON.stringify({
      type: 'agentDeviceUpdate',
      deviceId: updatedDevice.device.deviceId,
      agentDevice: updatedDevice
    }));

    // 通知agent端做对应的变更mqtt监听
    res.status(200).json(updatedDevice);
  } else {
    // 新建绑定设备
    if (!data.agentId || !mongoose.Types.ObjectId.isValid(data.agentId)) {
      const error = new Error('需要有效的Agent ID');
      error.status = 400;
      throw error;
    }

    const agentDevice = await Device.findById(data.agentId);
    if (!agentDevice) {
      const error = new Error('未找到对应的Agent设备');
      error.status = 404;
      throw error;
    }

    const sameDevice = await AgentDevice.findOne({
      agentId: data.agentId,
      device: deviceId,
      deviceName: data.deviceName
    });
    if (sameDevice) {
      const error = new Error(`该设备已被Agent：${sameDevice.agentId}绑定，请勿重复绑定`);
      error.status = 400;
      throw error;
    }

    const newDevice = await AgentDevice.create({
      ...data,
      device: deviceId
    });

    // 创建后通知agent端做对应的添加mqtt监听
    req.app.mqttClient.publish(`/devices/${agentDevice.deviceId}/sys/messages/down`, JSON.stringify({
      type: 'agentDeviceCreate',
      deviceId: newDevice.deviceId,
      agentDevice: newDevice
    }));

    res.status(201).json(newDevice);
  }
}))

router.get('/', asyncHandler(async (req, res) => {
  const { agentId, agentDeviceId } = req.query; // 获取查询参数中的 productId
  let query = {};
  if (agentId) {
    query.agentId = agentId;
  }
  if (agentDeviceId) {
    agent_device = await Device.findOne({ deviceId: agentDeviceId });
    if (!agent_device) {
      const error = new Error('未找到该设备');
      error.status = 404;
      throw error;
    }
    query.agentId = agent_device._id;
  }
  const devices = await AgentDevice.find(query).populate('device');
  res.status(200).json(devices);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('无效ID');
    error.status = 400;
    throw error;
  }

  const device = await AgentDevice.findById(id).populate('device');
  if (!device) {
    const error = new Error('未找到该设备');
    error.status = 404;
    throw error;
  }
  res.status(200).json(device);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('无效ID');
    error.status = 400;
    throw error;
  }

  const device = await AgentDevice.findByIdAndDelete(id);
  if (!device) {
    const error = new Error('未找到该设备');
    error.status = 404;
    throw error;
  }

  // 删除后通知agent端做对应的取消mqtt监听
  req.app.mqttClient.publish(`/devices/${agentDevice.deviceId}/sys/messages/down`, JSON.stringify({
    type: 'agentDeviceDelete',
    deviceId: device.deviceId,
    agentDevice: null
  }));
  res.status(200).json({ message: '设备已删除' });
}));

module.exports = router;
