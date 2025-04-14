// 产品属性信息
const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  accessMethod: { type: Array, required: true },
  requestUrl: { type: String },
  requestMethod: { type: String },
  requestParam: { type: String },
  description: { type: String },
  dataRange: { type: Array },
  length: { type: Number },
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Property', propertySchema);