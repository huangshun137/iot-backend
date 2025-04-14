// 产品信息
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  protocal: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: Number, default: 0 },
  remark: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
