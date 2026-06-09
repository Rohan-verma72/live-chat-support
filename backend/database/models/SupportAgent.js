import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

const supportAgentSchema = new mongoose.Schema({
  agentId: { type: String, unique: true },
  name: { type: String, unique: true, index: true },
  email: {
    type: String,
    unique: true,
    sparse: true, 
    index: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: { type: String },
  role: {
    type: String,
    enum: ["admin", "agent"],
    default: "agent",
  },
  createdAt: { type: Number, default: () => Date.now() },
  lastSeenAt: Number,
});


supportAgentSchema
  .virtual("password")
  .set(function (password) {
    this._plainPassword = password;
  })
  .get(function () {
    return this._plainPassword;
  });

supportAgentSchema.pre("save", async function () {
  if (this._plainPassword) {
    this.passwordHash = await bcrypt.hash(this._plainPassword, SALT_ROUNDS);
    this._plainPassword = undefined;
  }
});


supportAgentSchema.methods.comparePassword = async function (password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};


supportAgentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

export const SupportAgent = mongoose.model("Agent", supportAgentSchema);
