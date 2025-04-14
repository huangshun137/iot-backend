// OTA 资源包模型
const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  version: { type: String, required: true, unique: true },
  description: { type: String },
  filePath: { type: String, required: true },
  size: { type: Number, required: true },
  md5: { type: String, required: true },
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Package', packageSchema);