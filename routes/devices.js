const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Device = require('../models/Device');
const DeviceOTA = require('../models/DeviceOTA');
const asyncHandler = require('express-async-handler');

// 创建设备（需要关联产品）
router.post('/', asyncHandler(async (req, res) => {
  const { _id, productId, ...data } = req.body;

  if (_id) {
    // 更新设备
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error('无效的设备ID');
      error.status = 400;
      throw error;
    }

    const existingDevice = await Device.findById(_id);
    if (!existingDevice) {
      const error = new Error('未找到该设备');
      error.status = 404;
      throw error;
    }

    // 如果传了新的 productId，验证其有效性
    if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('无效的产品ID');
      error.status = 400;
      throw error;
    }

    const updatedDevice = await Device.findByIdAndUpdate(
      _id,
      { ...data, product: productId || existingDevice.product },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedDevice);
  } else {
    // 新建设备（必须传 productId）
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('需要有效的产品ID');
      error.status = 400;
      throw error;
    }

    const newDevice = await Device.create({
      ...data,
      product: productId
    });

    // 新建设备添加mqtt订阅
    const { mqttClient, subscribedTopics } = req.app;
    const topic = `/devices/${newDevice.deviceId}/sys/messages/up`;
    if (mqttClient.connected && !subscribedTopics.has(topic)) {
      mqttClient.subscribe(topic, err => {
        if (err) return console.error('Initial subscribe error:', err);
        subscribedTopics.add(topic);
        console.log(`subscribed new device topics`);
      });
    }

    res.status(201).json(newDevice);
  }
}));

// 获取设备列表（包含关联产品信息）
router.get('/', asyncHandler(async (req, res) => {
  try {
    const devices = await Device.find().populate('product');
    res.json(devices);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 获取设备列表（包含设备OTA升级任务信息）
router.get('/getDataWidthOTATask', asyncHandler(async (req, res) => {
  const { productId } = req.query; // 获取查询参数中的 productId
  let query = {};
  if (productId) {
    query.product = new mongoose.Types.ObjectId(productId); // 设置查询条件
  }
  const devices = await Device.aggregate([
    // 第一阶段：基础筛选（如按设备状态）
    { $match: query },
    // 第二阶段：关联 DeviceOTA，并嵌套关联 OTATask
    {
      $lookup: {
        from: 'deviceotas', // 注意集合名称（默认是模型名的小写复数，如 `deviceotas`）
        let: { deviceId: '$_id' }, // 定义变量，值为当前 Device 的 _id
        pipeline: [
          // 子管道1：筛选符合条件的 DeviceOTA 记录
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$device', '$$deviceId'] }, // 关联条件：DeviceOTA.device = Device._id
                  { $in: ['$status', ['pending', 'running']] } // 筛选 status 为 pending 或 running
                ]
              }
            }
          },
          // 子管道 2：关联 OTATask 集合
          {
            $lookup: {
              from: 'otatasks', // OTATask 集合名称
              localField: 'otaTask', // DeviceOTA.otaTask 字段
              foreignField: '_id', // OTATask._id
              as: 'otaTaskInfo' // 存储关联结果
            }
          },
          // 展开 otaTaskInfo 数组（一对一关联）
          { $unwind: '$otaTaskInfo' },
          // 可选：重命名字段或选择需要的字段
          {
            $project: {
              status: 1,
              description: 1,
              otaTask: '$otaTaskInfo' // 将 otaTaskInfo 合并到 otaTask 字段
            }
          }
        ],
        as: 'activeOTAs' // 将结果存储到 activeOTAs 字段
      }
    },
    // 第三阶段：计算 hasActiveOTA 字段
    {
      $addFields: {
        hasActiveOTA: { $gt: [{ $size: '$activeOTAs' }, 0] } // 检查 activeOTAs 是否非空
      }
    },
    // 可选：隐藏 activeOTAs 数组（根据需求决定是否保留）
    // {
    //   $project: {
    //     activeOTAs: 0
    //   }
    // },
    // 第四阶段：关联 Product 并展开为对象
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'product'
      }
    },
    {
      $unwind: {
        path: '$product',
        preserveNullAndEmptyArrays: true
      }
    }
  ]);

  res.json(devices);
}));

// 获取OTA升级设备列表
router.get('/getOTADeviceList', asyncHandler(async (req, res) => {
  const { taskId } = req.query;
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    const error = new Error('无效的升级任务ID');
    error.statusCode = 400;
    throw error;
  }
  const devices = await DeviceOTA.find({ otaTask: taskId }).populate('device').populate('otaTask');
  res.json(devices);
}));

// 获取单个产品详情
router.get('/:id', asyncHandler(async (req, res) => {
  const deviceId = req.params.id;

  // 验证ID格式
  if (!mongoose.Types.ObjectId.isValid(deviceId)) {
    const error = new Error('无效的设备ID格式');
    error.statusCode = 400;
    throw error;
  }

  // 查询数据库
  const device = await Device.findById(deviceId).populate('product');

  // 处理未找到情况
  if (!device) {
    const error = new Error('未找到指定设备');
    error.statusCode = 500;
    throw error;
  }

  // 返回标准化响应
  res.status(200).json(device);
}));

// 删除单个设备
router.delete('/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      const error = new Error('无效的设备ID');
      error.status = 400;
      throw error; // 直接抛出错误
    }

    const deletedDevice = await Device.findByIdAndDelete(deviceId);
    if (!deletedDevice) {
      const error = new Error('未找到该设备');
      error.status = 404;
      throw error;
    }

    res.json({ 
      message: '设备已删除',
      deletedDeviceId: deviceId
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = err.status || 500;
    throw error;
  }
});

// emqx http auth test
router.post('/checkUser', asyncHandler(async (req, res) => {
  // const { data } = req.body;
  // console.log('checkUser::::', req.body);
  res.status(200).json({result: "allow"});
}));

module.exports = router;