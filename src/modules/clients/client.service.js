import Client from "./client.model.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * POPULATION
 * ============================================================
 */

const CLIENT_POPULATE = [
  {
    path: "companyId",
    select: "name legalName code slug logo status",
  },
  {
    path: "createdBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "updatedBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "deletedBy",
    select: "firstName lastName displayName email",
  },
];

/**
 * ============================================================
 * FIND CLIENT
 * ============================================================
 */

const findClientOrFail = async ({
  companyId,
  clientId,
  includeInactive = true,
}) => {
  const filter = {
    _id: clientId,
    companyId,
    isDeleted: false,
  };

  if (!includeInactive) {
    filter.status = "ACTIVE";
  }

  const client = await Client.findOne(filter);

  if (!client) {
    throw new ApiError(404, "Client not found.");
  }

  return client;
};

/**
 * ============================================================
 * DUPLICATE CHECK
 * ============================================================
 */

const ensureUniqueClient = async ({
  companyId,
  name,
  code,
  excludeClientId = null,
}) => {
  const conditions = [];

  if (name) {
    conditions.push({
      name: {
        $regex: `^${escapeRegex(name.trim())}$`,
        $options: "i",
      },
    });
  }

  if (code) {
    conditions.push({
      code: code.trim().toUpperCase(),
    });
  }

  if (conditions.length === 0) {
    return;
  }

  const filter = {
    companyId,
    isDeleted: false,
    $or: conditions,
  };

  if (excludeClientId) {
    filter._id = {
      $ne: excludeClientId,
    };
  }

  const duplicate = await Client.findOne(filter).select("_id name code").lean();

  if (!duplicate) {
    return;
  }

  if (name && duplicate.name.toLowerCase() === name.trim().toLowerCase()) {
    throw new ApiError(
      409,
      "A client with the same name already exists in this company.",
    );
  }

  if (code && duplicate.code.toUpperCase() === code.trim().toUpperCase()) {
    throw new ApiError(
      409,
      "A client with the same code already exists in this company.",
    );
  }

  throw new ApiError(409, "A client with the supplied details already exists.");
};

/**
 * ============================================================
 * REGEX HELPER
 * ============================================================
 */

const escapeRegex = (value = "") => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * ============================================================
 * CREATE CLIENT
 * ============================================================
 */

export const createClient = async ({ companyId, payload, requesterUserId }) => {
  await ensureUniqueClient({
    companyId,
    name: payload.name,
    code: payload.code,
  });

  const client = await Client.create({
    companyId,

    name: payload.name,

    code: payload.code,

    clientType: payload.clientType ?? "EXTERNAL",

    engagementType: payload.engagementType ?? "PROJECT",

    contactPerson: payload.contactPerson ?? "",

    email: payload.email ?? "",

    mobile: payload.mobile ?? "",

    alternateMobile: payload.alternateMobile ?? "",

    website: payload.website ?? "",

    address: {
      addressLine1: payload.address?.addressLine1 ?? "",

      addressLine2: payload.address?.addressLine2 ?? "",

      city: payload.address?.city ?? "",

      district: payload.address?.district ?? "",

      state: payload.address?.state ?? "",

      country: payload.address?.country ?? "India",

      postalCode: payload.address?.postalCode ?? "",
    },

    industry: payload.industry ?? "",

    notes: payload.notes ?? "",

    status: payload.status ?? "ACTIVE",

    createdBy: requesterUserId,

    updatedBy: requesterUserId,
  });

  return Client.findById(client._id).populate(CLIENT_POPULATE).lean();
};

/**
 * ============================================================
 * LIST CLIENTS
 * ============================================================
 */

export const listClients = async ({ companyId, query }) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    clientType,
    engagementType,
    industry,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  /**
   * ==========================================================
   * BASIC FILTERS
   * ==========================================================
   */

  if (status) {
    filter.status = status;
  }

  if (clientType) {
    filter.clientType = clientType;
  }

  if (engagementType) {
    filter.engagementType = engagementType;
  }

  if (industry) {
    filter.industry = {
      $regex: escapeRegex(industry),
      $options: "i",
    };
  }

  /**
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");

    filter.$or = [
      {
        name: expression,
      },
      {
        code: expression,
      },
      {
        contactPerson: expression,
      },
      {
        email: expression,
      },
      {
        mobile: expression,
      },
      {
        industry: expression,
      },
      {
        website: expression,
      },
    ];
  }

  /**
   * ==========================================================
   * PAGINATION + SORT
   * ==========================================================
   */

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [records, totalRecords] = await Promise.all([
    Client.find(filter)
      .populate(CLIENT_POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Client.countDocuments(filter),
  ]);

  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

  return {
    records,

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

/**
 * ============================================================
 * GET CLIENT BY ID
 * ============================================================
 */

export const getClientById = async ({ companyId, clientId }) => {
  const client = await Client.findOne({
    _id: clientId,

    companyId,

    isDeleted: false,
  })
    .populate(CLIENT_POPULATE)
    .lean();

  if (!client) {
    throw new ApiError(404, "Client not found.");
  }

  return client;
};

/**
 * ============================================================
 * UPDATE CLIENT
 * ============================================================
 */

export const updateClient = async ({
  companyId,
  clientId,
  payload,
  requesterUserId,
}) => {
  const client = await findClientOrFail({
    companyId,

    clientId,
  });

  /**
   * If name or code is being changed,
   * ensure it does not conflict with another client.
   */
  if (payload.name !== undefined || payload.code !== undefined) {
    await ensureUniqueClient({
      companyId,

      name: payload.name !== undefined ? payload.name : undefined,

      code: payload.code !== undefined ? payload.code : undefined,

      excludeClientId: client._id,
    });
  }

  /**
   * ==========================================================
   * SIMPLE FIELDS
   * ==========================================================
   */

  if (payload.name !== undefined) {
    client.name = payload.name;
  }

  if (payload.code !== undefined) {
    client.code = payload.code;
  }

  if (payload.clientType !== undefined) {
    client.clientType = payload.clientType;
  }

  if (payload.engagementType !== undefined) {
    client.engagementType = payload.engagementType;
  }

  if (payload.contactPerson !== undefined) {
    client.contactPerson = payload.contactPerson;
  }

  if (payload.email !== undefined) {
    client.email = payload.email;
  }

  if (payload.mobile !== undefined) {
    client.mobile = payload.mobile;
  }

  if (payload.alternateMobile !== undefined) {
    client.alternateMobile = payload.alternateMobile;
  }

  if (payload.website !== undefined) {
    client.website = payload.website;
  }

  if (payload.industry !== undefined) {
    client.industry = payload.industry;
  }

  if (payload.notes !== undefined) {
    client.notes = payload.notes;
  }

  /**
   * ==========================================================
   * ADDRESS
   *
   * Partial address updates are supported.
   * ==========================================================
   */

  if (payload.address !== undefined) {
    if (payload.address.addressLine1 !== undefined) {
      client.address.addressLine1 = payload.address.addressLine1;
    }

    if (payload.address.addressLine2 !== undefined) {
      client.address.addressLine2 = payload.address.addressLine2;
    }

    if (payload.address.city !== undefined) {
      client.address.city = payload.address.city;
    }

    if (payload.address.district !== undefined) {
      client.address.district = payload.address.district;
    }

    if (payload.address.state !== undefined) {
      client.address.state = payload.address.state;
    }

    if (payload.address.country !== undefined) {
      client.address.country = payload.address.country;
    }

    if (payload.address.postalCode !== undefined) {
      client.address.postalCode = payload.address.postalCode;
    }
  }

  client.updatedBy = requesterUserId;

  await client.save();

  return Client.findById(client._id).populate(CLIENT_POPULATE).lean();
};

/**
 * ============================================================
 * UPDATE CLIENT STATUS
 * ============================================================
 */

export const updateClientStatus = async ({
  companyId,
  clientId,
  status,
  requesterUserId,
}) => {
  const client = await findClientOrFail({
    companyId,

    clientId,
  });

  if (client.status === status) {
    throw new ApiError(400, `Client is already ${status.toLowerCase()}.`);
  }

  client.status = status;

  client.updatedBy = requesterUserId;

  await client.save();

  return Client.findById(client._id).populate(CLIENT_POPULATE).lean();
};

/**
 * ============================================================
 * SOFT DELETE CLIENT
 * ============================================================
 */

export const deleteClient = async ({
  companyId,
  clientId,
  requesterUserId,
}) => {
  const client = await findClientOrFail({
    companyId,

    clientId,
  });

  const deletedAt = new Date();

  client.isDeleted = true;

  client.deletedAt = deletedAt;

  client.deletedBy = requesterUserId;

  client.updatedBy = requesterUserId;

  await client.save();

  return {
    clientId: client._id,

    deletedAt,
  };
};
