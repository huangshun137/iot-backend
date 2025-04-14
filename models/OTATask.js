// OTA 任务模型
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { 
    type: String,
    enum: ['pending', 'running', 'completed', 'canceled', 'failed'],
    default: 'pending'
  },
  package: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true
  },
  deviceList: { 
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Device',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OTATask', taskSchema);