import slugify from "slugify";

import { ApiError } from "../../utils/ApiError.js";
import Company from "./company.model.js";

const generateCompanySlug = (name, code) => {
  const nameSlug = slugify(name, {
    lower: true,
    strict: true,
    trim: true,
  });

  const codeSlug = slugify(code, {
    lower: true,
    strict: true,
    trim: true,
  });

  return `${nameSlug}-${codeSlug}`;
};

const ensureCompanyUniqueness = async ({ code, slug, excludeCompanyId }) => {
  const conditions = [];

  if (code) {
    conditions.push({
      code: code.toUpperCase(),
    });
  }

  if (slug) {
    conditions.push({
      slug,
    });
  }

  if (conditions.length === 0) {
    return;
  }

  const filter = {
    isDeleted: false,
    $or: conditions,
  };

  if (excludeCompanyId) {
    filter._id = {
      $ne: excludeCompanyId,
    };
  }

  const existingCompany = await Company.findOne(filter).lean();

  if (!existingCompany) {
    return;
  }

  if (code && existingCompany.code === code.toUpperCase()) {
    throw new ApiError(409, "A company with this code already exists.");
  }

  if (slug && existingCompany.slug === slug) {
    throw new ApiError(
      409,
      "A company with this name and code already exists.",
    );
  }
};

export const createCompany = async (companyData, actorId = null) => {
  const normalizedCode = companyData.code.toUpperCase();

  const slug = generateCompanySlug(companyData.name, normalizedCode);

  await ensureCompanyUniqueness({
    code: normalizedCode,
    slug,
  });

  const company = await Company.create({
    ...companyData,
    code: normalizedCode,
    currency: companyData.currency?.toUpperCase() || "INR",
    slug,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return company;
};

export const listCompanies = async ({
  page = 1,
  limit = 10,
  search,
  status,
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  const filter = {
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (search) {
    const searchExpression = new RegExp(search, "i");

    filter.$or = [
      { name: searchExpression },
      { legalName: searchExpression },
      { code: searchExpression },
      { email: searchExpression },
      { phone: searchExpression },
    ];
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [companies, totalRecords] = await Promise.all([
    Company.find(filter).sort(sort).skip(skip).limit(limit).lean(),

    Company.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    records: companies,

    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

export const getCompanyById = async (companyId) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  }).lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  return company;
};

export const updateCompany = async (companyId, updateData, actorId = null) => {
  const existingCompany = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  });

  if (!existingCompany) {
    throw new ApiError(404, "Company not found.");
  }

  const normalizedCode = updateData.code
    ? updateData.code.toUpperCase()
    : existingCompany.code;

  const updatedName = updateData.name || existingCompany.name;

  const slug = generateCompanySlug(updatedName, normalizedCode);

  await ensureCompanyUniqueness({
    code: normalizedCode,
    slug,
    excludeCompanyId: companyId,
  });

  const normalizedUpdateData = {
    ...updateData,
    code: normalizedCode,
    slug,
    updatedBy: actorId,
  };

  if (updateData.currency) {
    normalizedUpdateData.currency = updateData.currency.toUpperCase();
  }

  const updatedCompany = await Company.findOneAndUpdate(
    {
      _id: companyId,
      isDeleted: false,
    },
    {
      $set: normalizedUpdateData,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return updatedCompany;
};

export const updateCompanyStatus = async (
  companyId,
  status,
  actorId = null,
) => {
  const company = await Company.findOneAndUpdate(
    {
      _id: companyId,
      isDeleted: false,
    },
    {
      $set: {
        status,
        updatedBy: actorId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  return company;
};

export const softDeleteCompany = async (companyId, actorId = null) => {
  const company = await Company.findOneAndUpdate(
    {
      _id: companyId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        status: "INACTIVE",
        deletedAt: new Date(),
        deletedBy: actorId,
        updatedBy: actorId,
      },
    },
    {
      new: true,
    },
  );

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  return company;
};
