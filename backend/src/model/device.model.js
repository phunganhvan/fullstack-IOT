const mongoose = require('mongoose');
const DEVICE_STATUSES = ['on', 'off', 'loading'];
const DEVICE_TYPES = ['bulb', 'fan', 'ac'];

const deviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
    dashboardType: {
      type: String,
      enum: DEVICE_TYPES,
      default: 'bulb',
      lowercase: true,
      trim: true,
    },
    dashboardIcon: {
      type: String,
      enum: DEVICE_TYPES,
      default: 'bulb',
      lowercase: true,
      trim: true,
    },
    actionIcon: {
      type: String,
      default: '🔧',
      trim: true,
    },
    isSimulated: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      required: true,
      enum: DEVICE_STATUSES,
      lowercase: true,
      trim: true,
      default: 'off',
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

deviceSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports = mongoose.models.Device || mongoose.model('Device', deviceSchema);
