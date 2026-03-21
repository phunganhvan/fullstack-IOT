const mongoose = require('mongoose');

const ACTIONS = ['on', 'off'];
const STATUSES = ['loading', 'success', 'error'];

const actionHistorySchema = new mongoose.Schema(
  {
    idDevice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: ACTIONS,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: STATUSES,
      lowercase: true,
      trim: true,
      default: 'loading',
    },
    time: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    versionKey: false,
  }
);

actionHistorySchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports =
  mongoose.models.ActionHistory ||
  mongoose.model('ActionHistory', actionHistorySchema);
