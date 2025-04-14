// 命令下发参数信息
const mongoose = require('mongoose');

const reqParamsSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  description: { type: String },
  dataRange: { type: Array },
  length: { type: Number },
  command: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Command',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReqParams', reqParamsSchema);