import mongoose from "mongoose";

const { Schema, model } = mongoose;

const addressSchema = new Schema(
  {
    addressLine1: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    addressLine2: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    district: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    state: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "India",
    },

    postalCode: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },
  },
  {
    _id: false,
  },
);

const emergencyContactSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    relationship: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    mobile: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },

    alternateMobile: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },
  },
  {
    _id: true,
  },
);

const documentSchema = new Schema(
  {
    documentType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    documentName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    documentNumber: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    fileUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: true,
  },
);

const employeeSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    companyAccessId: {
      type: Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    personalDetails: {
      dateOfBirth: {
        type: Date,
        default: null,
      },

      gender: {
        type: String,
        enum: ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY", null],
        default: null,
      },

      maritalStatus: {
        type: String,
        enum: [
          "SINGLE",
          "MARRIED",
          "DIVORCED",
          "WIDOWED",
          "SEPARATED",
          "OTHER",
          null,
        ],
        default: null,
      },

      bloodGroup: {
        type: String,
        enum: [
          "A_POSITIVE",
          "A_NEGATIVE",
          "B_POSITIVE",
          "B_NEGATIVE",
          "AB_POSITIVE",
          "AB_NEGATIVE",
          "O_POSITIVE",
          "O_NEGATIVE",
          "UNKNOWN",
          null,
        ],
        default: null,
      },

      nationality: {
        type: String,
        trim: true,
        maxlength: 100,
        default: "Indian",
      },
    },

    contactDetails: {
      personalEmail: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 200,
        default: "",
      },

      alternateMobile: {
        type: String,
        trim: true,
        maxlength: 20,
        default: "",
      },

      currentAddress: {
        type: addressSchema,
        default: () => ({}),
      },

      permanentAddress: {
        type: addressSchema,
        default: () => ({}),
      },

      isPermanentAddressSame: {
        type: Boolean,
        default: false,
      },
    },

    emergencyContacts: {
      type: [emergencyContactSchema],
      default: [],
    },

    bankDetails: {
      accountHolderName: {
        type: String,
        trim: true,
        maxlength: 200,
        default: "",
      },

      bankName: {
        type: String,
        trim: true,
        maxlength: 200,
        default: "",
      },

      accountNumber: {
        type: String,
        trim: true,
        maxlength: 50,
        default: "",
      },

      ifscCode: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 20,
        default: "",
      },

      branchName: {
        type: String,
        trim: true,
        maxlength: 200,
        default: "",
      },

      accountType: {
        type: String,
        enum: ["SAVINGS", "CURRENT", "SALARY", "OTHER", null],
        default: null,
      },
    },

    statutoryDetails: {
      panNumber: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 20,
        default: "",
      },

      aadhaarNumber: {
        type: String,
        trim: true,
        maxlength: 20,
        default: "",
      },

      uanNumber: {
        type: String,
        trim: true,
        maxlength: 30,
        default: "",
      },

      esiNumber: {
        type: String,
        trim: true,
        maxlength: 30,
        default: "",
      },

      pfNumber: {
        type: String,
        trim: true,
        maxlength: 50,
        default: "",
      },

      taxRegime: {
        type: String,
        enum: ["OLD", "NEW", null],
        default: null,
      },
    },

    documents: {
      type: [documentSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

employeeSchema.index(
  {
    companyId: 1,
    userId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

employeeSchema.index(
  {
    companyAccessId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

employeeSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

employeeSchema.index({
  companyId: 1,
  "statutoryDetails.panNumber": 1,
});

employeeSchema.index({
  companyId: 1,
  "statutoryDetails.aadhaarNumber": 1,
});

employeeSchema.pre("save", function employeePreSave() {
  if (
    this.contactDetails?.isPermanentAddressSame &&
    this.contactDetails?.currentAddress
  ) {
    this.contactDetails.permanentAddress =
      this.contactDetails.currentAddress.toObject?.() ??
      this.contactDetails.currentAddress;
  }
});

employeeSchema.set("toJSON", {
  transform: function transformDocument(_document, returnedObject) {
    if (returnedObject?.bankDetails?.accountNumber) {
      const accountNumber = returnedObject.bankDetails.accountNumber;

      returnedObject.bankDetails.accountNumber =
        accountNumber.length > 4
          ? `${"*".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`
          : accountNumber;
    }

    if (returnedObject?.statutoryDetails?.aadhaarNumber) {
      const aadhaarNumber = returnedObject.statutoryDetails.aadhaarNumber;

      returnedObject.statutoryDetails.aadhaarNumber =
        aadhaarNumber.length > 4
          ? `${"*".repeat(aadhaarNumber.length - 4)}${aadhaarNumber.slice(-4)}`
          : aadhaarNumber;
    }

    return returnedObject;
  },
});

const Employee = model("Employee", employeeSchema);
export default Employee;
