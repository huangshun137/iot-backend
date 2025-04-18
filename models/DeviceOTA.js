// 设备OTA升级信息
const mongoose = require('mongoose');

const deviceOTASchema = new mongoose.Schema({
  device: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  otaTask: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OTATask',
    required: true
  },
  status: { 
    type: String,
    enum: ['pending', 'running', 'completed', 'canceled', 'stopping', 'failed'],
    default: 'pending'
  },
  path: { type: String },
  description: { type: String }
});

module.exports = mongoose.model('DeviceOTA', deviceOTASchema);