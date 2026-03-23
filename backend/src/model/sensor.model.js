const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        unit: {
            type: String,
            default: '',
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isSimulated: {
            type: Boolean,
            default: false,
        },
        randomMin: {
            type: Number,
            default: 0,
        },
        randomMax: {
            type: Number,
            default: 100,
        },
        chartColor: {
            type: String,
            default: '',
            trim: true,
        },
    },
    {
        versionKey: false,
        timestamps: true,
    }
);

sensorSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
    },
});

module.exports =
    mongoose.models.Sensor ||
    mongoose.model('Sensor', sensorSchema);
