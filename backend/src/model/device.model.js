const mongoose = require('mongoose');
const { DEVICE_IDS } = require('../constants/devices');

const DEVICE_STATUSES = ['on', 'off', 'loading'];

const deviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      enum: DEVICE_IDS,
      lowercase: true,
      trim: true,
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
