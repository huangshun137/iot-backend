// 设备信息
const mongoose = require('mongoose');

const agentDeviceSchema = new mongoose.Schema({
  isCustomDevice: { type: Boolean, default: false },
  deviceName: { type: String },
  device: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  },
  agentId: { type: String, required: true },
  directory: { type: String, required: true },
  entryName: { type: String, required: true },
  condaEnv: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AgentDevice', agentDeviceSchema);