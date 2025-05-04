// 设备信息
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  name: { type: String },
  code: { type: String, required: true },
  deviceId: { type: String, required: true, unique: true },
  ipAddress: { type: String },
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  status: { 
    type: String,
    enum: ['online', 'offline', 'maintenance', 'unActivated'],
    default: 'unActivated'
  },
  version: { type: String },
  lastActive: {
    type: Date,
    default: null
  },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Device', deviceSchema);