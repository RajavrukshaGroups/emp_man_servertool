import { connectDatabase, disconnectDatabase } from "../config/database.js";

import User from "../modules/users/user.model.js";
import Role from "../modules/roles/role.model.js";
import PlatformAccess from "../modules/platform-access/platformAccess.model.js";

const run = async () => {
  try {
    await connectDatabase();

    const role = await Role.findOne({
      code: "SUPER_ADMIN",
      scopeType: "GLOBAL",
      status: "ACTIVE",
      isDeleted: false,
    });

    if (!role) {
      throw new Error("SUPER_ADMIN global role not found. Run seed first.");
    }

    let user = await User.findOne({
      email: "superadmin@ems.com",
      isDeleted: false,
    });

    if (!user) {
      user = await User.create({
        firstName: "Platform",
        middleName: "",
        lastName: "Administrator",
        displayName: "Platform Super Admin",
        email: "superadmin@ems.com",
        mobile: "9876500001",
        password: "SuperAdmin@123",
        gender: "MALE",
        dateOfBirth: new Date("1990-01-01"),
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
        onboardingStatus: "COMPLETED",
        onboardingCompanyId: null,
        onboardingCompletedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      });

      console.log("Super Admin user created:", user._id.toString());
    } else {
      console.log("Super Admin user already exists:", user._id.toString());
    }

    const existingPlatformAccess = await PlatformAccess.findOne({
      userId: user._id,
      isDeleted: false,
    });

    if (!existingPlatformAccess) {
      const access = await PlatformAccess.create({
        userId: user._id,
        roleId: role._id,
        status: "ACTIVE",
        createdBy: null,
        updatedBy: null,
      });

      console.log("Platform access created:", access._id.toString());
    } else {
      console.log(
        "Platform access already exists:",
        existingPlatformAccess._id.toString(),
      );
    }

    console.log("Super Admin bootstrap completed successfully.");
  } catch (error) {
    console.error("Super Admin bootstrap failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

run();