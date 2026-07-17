import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Permission code is required."],
      unique: true,
      trim: true,
      lowercase: true,
    },

    module: {
      type: String,
      required: [true, "Permission module is required."],
      trim: true,
      lowercase: true,
      index: true,
    },

    action: {
      type: String,
      required: [true, "Permission action is required."],
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      required: [true, "Permission name is required."],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    isSystem: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

permissionSchema.index({ module: 1, action: 1 });
permissionSchema.index({ module: 1, status: 1 });

const Permission = mongoose.model("Permission", permissionSchema);

export default Permission;
