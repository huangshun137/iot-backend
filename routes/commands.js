const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Command = require('../models/Command');
const ReqParams = require('../models/ReqParams');
const ResParams = require('../models/ResParams');
const asyncHandler = require('express-async-handler');
const { createBatch: createReqBatch, updateBatch: updateReqBatch, deleteBatch: deleteReqBatch } = require('./reqParams');
const { createBatch: createResBatch, updateBatch: updateResBatch, deleteBatch: deleteResBatch } = require('./resParams');

// 新增/更新下发参数和响应参数
async function addOrUpdateParams(reqParams, resParams, commandId) {
  if (reqParams?.length > 0) {
    const newReqParams = [], _reqParams = [];
    reqParams.forEach(item => {
      if (item._id) _reqParams.push({ ...item, commandId })
        else newReqParams.push({ ...item, commandId })
    })
    // 新增下发参数
    if (newReqParams.length > 0) {
      await createReqBatch(newReqParams)
    }
    // 更新下发参数
    if (_reqParams.length > 0) {
      await updateReqBatch(_reqParams)
    }
  }
  if (resParams?.length > 0) {
    const newResParams = [], _resParams = [];
    resParams.forEach(item => {
      if (item._id) _resParams.push({ ...item, commandId })
        else newResParams.push({ ...item, commandId })
    })
    // 新增响应参数
    if (newResParams.length > 0) {
      await createResBatch(newResParams)
    }
    // 更新响应参数
    if (_resParams.length > 0) {
      await updateResBatch(_resParams)
    }
  }
}

// 创建命令（需要关联产品）
router.post('/', asyncHandler(async (req, res) => {
  const { _id, productId, deleteReqParamsIds, deleteResParamsIds, reqParams, resParams, ...data } = req.body;

  if (_id) {
    // 更新命令
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error('无效的命令ID');
      error.status = 400;
      throw error;
    }

    const existingCommand = await Command.findById(_id);
    if (!existingCommand) {
      const error = new Error('未找到该命令');
      error.status = 500;
      throw error;
    }

    // 如果传了新的 productId，验证其有效性
    if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('无效的产品ID');
      error.status = 400;
      throw error;
    }

    const updatedCommand = await Command.findByIdAndUpdate(
      _id,
      { ...data, product: productId || existingCommand.product },
      { new: true, runValidators: true }
    );

    // 删除关联下发参数和响应参数
    if (deleteReqParamsIds?.length > 0) {
      await deleteReqBatch(deleteReqParamsIds);
    }
    if (deleteResParamsIds?.length > 0) {
      await deleteResBatch(deleteResParamsIds);
    }
    // 新增/更新下发参数和响应参数
    await addOrUpdateParams(reqParams, resParams, _id);

    res.status(200).json(updatedCommand);
  } else {
    // 新建命令（必须传 productId）
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('需要有效的产品ID');
      error.status = 400;
      throw error;
    }

    const newCommand = await Command.create({
      ...data,
      product: productId
    });
    // 新增/更新下发参数和响应参数
    await addOrUpdateParams(reqParams, resParams, newCommand._id);

    res.status(201).json(newCommand);
  }
}));

// 获取命令列表（包含关联参数信息）
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
    const command = await Command.find(query)
      .populate('reqParams')
      .populate('resParams');
    res.json(command);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 删除单个属性
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const commandId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(commandId)) {
      const error = new Error('无效的命令ID');
      error.status = 400;
      throw error; // 直接抛出错误
    }

    const deletedCommand = await Command.findByIdAndDelete(commandId);
    if (!deletedCommand) {
      const error = new Error('未找到该命令');
      error.status = 500;
      throw error;
    }
		
		// 级联删除关联下发参数
		await ReqParams.deleteMany({ command: commandId });
		// 级联删除关联响应参数
		await ResParams.deleteMany({ command: commandId });

    res.json({ 
      message: '命令已删除',
      deletedCommandId: commandId
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = err.status || 500;
    throw error;
  }
}));

module.exports = router;