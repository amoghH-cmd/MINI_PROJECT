const mongoose = require('mongoose');

// Append-only, hash-chained. Tamper-EVIDENT, not tamper-proof (HLD 4.11).
// Application-level guards below block updates/deletes through Mongoose; a database
// administrator could still alter raw documents, which verify-chain would then detect.
const auditSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, unique: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, default: null },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, default: null },
    beforeHash: { type: String, default: null },
    afterHash: { type: String, default: null },
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
    at: { type: Date, required: true, index: true },
  },
  { minimize: false, versionKey: false }
);

const blocked = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
];
blocked.forEach((op) =>
  auditSchema.pre(op, function () {
    throw new Error('AuditLog is append-only');
  })
);
auditSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('AuditLog is append-only'));
  next();
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
