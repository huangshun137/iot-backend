const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ReqParams = require('../models/ReqParams');
const asyncHandler = require('express-async-handler');

// 创建下发参数（需要关联命令）
router.post('/', asyncHandler(async (req, res) => {
  const { _id, commandId, ...data } = req.body;

  if (_id) {
    // 更新参数
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error('无效的参数ID');
      error.status = 400;
      throw error;
    }

    const existingParams = await ReqParams.findById(_id);
    if (!existingParams) {
      const error = new Error('未找到该参数');
      error.status = 500;
      throw error;
    }

    // 如果传了新的 commandId，验证其有效性
    if (commandId && !mongoose.Types.ObjectId.isValid(commandId)) {
      const error = new Error('无效的命令ID');
      error.status = 400;
      throw error;
    }

    const updatedParams = await ReqParams.findByIdAndUpdate(
      _id,
      { ...data, command: commandId || existingParams.command },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedParams);
  } else {
    // 新建参数（必须传 commandId）
    if (!commandId || !mongoose.Types.ObjectId.isValid(commandId)) {
      const error = new Error('需要有效的命令ID');
      error.status = 400;
      throw error;
    }

    const newParams = await ReqParams.create({
      ...data,
      command: commandId
    });

    res.status(201).json(newParams);
  }
}));

// 获取参数列表（包含关联命令信息）
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { commandId } = req.query; // 获取查询参数中的 commandId
    let query = {};

    if (commandId) {
			if (!mongoose.Types.ObjectId.isValid(commandId)) {
				const error = new Error('无效的命令ID');
				error.status = 400;
				throw error;
			}
			query.command = commandId; // 设置查询条件
    }
    const params = await ReqParams.find(query);
    res.json(params);
  } catch (err) {
    const error = new Error(err.message);
    error.status = 500;
    throw error;
  }
}));

// 删除单个属性
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const paramsId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(paramsId)) {
      const error = new Error('无效的参数ID');
      error.status = 400;
      throw error; // 直接抛出错误
    }

    const deletedParams = await ReqParams.findByIdAndDelete(paramsId);
    if (!deletedParams) {
      const error = new Error('未找到该命令');
      error.status = 500;
      throw error;
    }

    res.json({ 
      message: '参数已删除',
      deletedParamsId: paramsId
    });
  } catch (err) {
    const error = new Error(err.message);
    error.status = err.status || 500;
    throw error;
  }
}));

// 批量新增
async function createBatch(paramsList) {
  if (!Array.isArray(paramsList)) {
    const error = new Error('请求体必须是一个数组');
    error.status = 400;
    throw error;
  }

  const newParams = await ReqParams.insertMany(paramsList.map(param => ({
    ...param,
    command: param.commandId
  })));
  
  return newParams;
}

// 批量新增接口
router.post('/batch', asyncHandler(async (req, res) => {
  try {
    const paramsList = req.body;
    const newParams = await createBatch(paramsList);
    res.status(201).json(newParams);
  } catch (err) {
    const error = new Error(err.message);
    error.status = err.status || 500;
    throw error;
  }
}));

// 批量修改
async function updateBatch(updatesList) {
  if (!Array.isArray(updatesList)) {
    const error = new Error('请求体必须是一个数组');
    error.status = 400;
    throw error;
  }

  const updatePromises = updatesList.map(async update => {
    const { _id, commandId, ...data } = update;

    if (!mongoose.Types.ObjectId.isValid(_id)) {
      const error = new Error(`无效的参数ID: ${_id}`);
      error.status = 400;
      throw error;
    }

    const existingParams = await ReqParams.findById(_id);
    if (!existingParams) {
      const error = new Error(`未找到该参数: ${_id}`);
      error.status = 500;
      throw error;
    }

    if (commandId && !mongoose.Types.ObjectId.isValid(commandId)) {
      const error = new Error(`无效的命令ID: ${commandId}`);
      error.status = 400;
      throw error;
    }

    return ReqParams.findByIdAndUpdate(
      _id,
      { ...data, command: commandId || existingParams.command },
      { new: true, runValidators: true }
    );
  });

  const updatedParams = await Promise.all(updatePromises);

  return updatedParams;
}

// 批量修改接口
router.put('/batch', asyncHandler(async (req, res) => {
  try {
    const updatesList = req.body;
    const updatedParams = await updateBatch(updatesList);
    res.status(200).json(updatedParams);
  } catch (err) {
    const error = new Error(err.message);
    error.status = err.status || 500;
    throw error;
  }
}));

// 批量删除
async function deleteBatch(ids) {
  if (!Array.isArray(ids)) {
    const error = new Error('请求体必须是一个数组');
    error.status = 400;
    throw error;
  }

  const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    const error = new Error(`无效的参数ID: ${invalidIds.join(', ')}`);
    error.status = 400;
    throw error;
  }

  await ReqParams.deleteMany({ _id: { $in: ids } });
}

// 批量删除接口
router.delete('/batch', asyncHandler(async (req, res) => {
  const ids = req.body;
  await deleteBatch(ids);
  res.json({ 
    message: '参数已删除',
    deletedCount: ids
  });
}));

module.exports = { router, createBatch, updateBatch, deleteBatch };