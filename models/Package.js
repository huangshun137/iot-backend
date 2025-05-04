// OTA 资源包模型
const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true }, // 资源包名称
  version: { type: String, required: true },
  description: { type: String },
  entry: { type: String, default: 'main.py' }, // 资源包运行入口文件名
  processPath: { type: String }, // 资源包进程文件名
  filePath: { type: String, required: true }, // 资源包存储路径
  size: { type: Number, required: true },
  md5: { type: String, required: true },
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// 添加复合唯一索引：同一产品下，未删除的版本号必须唯一
packageSchema.index(
  { product: 1, version: 1, isDeleted: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { isDeleted: false } // 仅对 isDeleted: false 的文档生效
  }
);

module.exports = mongoose.model('Package', packageSchema);