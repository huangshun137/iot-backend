// 产品命令信息
const { request } = require('express');
const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  requestUrl: { type: String },
  // requestMethod: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE'] },
  requestMethod: { type: String },
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
}, {
  // 关键配置：启用虚拟字段的序列化
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true }
});

// 定义虚拟字段 - 请求参数
commandSchema.virtual('reqParams', {
  ref: 'ReqParams',       // 关联模型
  localField: '_id',      // 本模型主键
  foreignField: 'command', // 关联模型的外键字段
  justOne: false          // 一对多关系
});

// 定义虚拟字段 - 响应参数
commandSchema.virtual('resParams', {
  ref: 'ResParams',
  localField: '_id',
  foreignField: 'command',
  justOne: false
});

module.exports = mongoose.model('Command', commandSchema);