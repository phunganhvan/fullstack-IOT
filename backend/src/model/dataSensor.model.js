const mongoose = require('mongoose');

const dataSensorSchema = new mongoose.Schema(
  {
    idSensor: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Sensor',
      index: true,
    },
    // Legacy field kept for backward-compatible reads during migration.
    sensorName: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    versionKey: false,
  }
);

dataSensorSchema.index({ idSensor: 1, timestamp: -1 });

dataSensorSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports =
  mongoose.models.DataSensor || mongoose.model('DataSensor', dataSensorSchema);
