import { prisma } from './db.service.js';

export const assignDefaultRole = async (userId) => {
  try {
    // Check if default role exists
    let defaultRole = await prisma.role.findUnique({
      where: { name: 'user' }, // Ensure a role called 'user' exists
    });

    // If not, create it
    if (!defaultRole) {
      defaultRole = await prisma.role.create({
        data: { name: 'user' },
      });
    }

    // Now assign the role to the user
    await prisma.modelHasRoles.create({
      data: {
        userId,
        roleId: defaultRole.id,
      },
    });

    console.log(`Assigned default role 'user' to user ${userId}`);
  } catch (err) {
    console.error("Error assigning default role:", err);
    throw err;
  }
};
