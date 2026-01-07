import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@citypower.co.za' },
    update: {},
    create: {
      email: 'admin@citypower.co.za',
      passwordHash: adminPassword,
      name: 'System Admin',
      role: UserRole.ADMIN,
    },
  });
  console.log('Created admin user:', admin.email);

  // Create supervisor user
  const supervisorPassword = await bcrypt.hash('supervisor123', 12);
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@citypower.co.za' },
    update: {},
    create: {
      email: 'supervisor@citypower.co.za',
      passwordHash: supervisorPassword,
      name: 'Field Supervisor',
      role: UserRole.SUPERVISOR,
    },
  });
  console.log('Created supervisor user:', supervisor.email);

  // Create technician users
  const techPassword = await bcrypt.hash('tech123', 12);
  const technicians = [
    { email: 'tech1@citypower.co.za', name: 'John Mokoena' },
    { email: 'tech2@citypower.co.za', name: 'Thabo Nkosi' },
    { email: 'tech3@citypower.co.za', name: 'Sipho Dlamini' },
  ];

  for (const tech of technicians) {
    const user = await prisma.user.upsert({
      where: { email: tech.email },
      update: {},
      create: {
        email: tech.email,
        passwordHash: techPassword,
        name: tech.name,
        role: UserRole.TECHNICIAN,
      },
    });
    console.log('Created technician:', user.email);
  }

  // Create sample locations (Johannesburg townships)
  const locations = [
    { standNo: '123', township: 'Nirvana', address: 'Cnr Rose and Lilly Street' },
    { standNo: '456', township: 'Nirvana', address: '45 Main Road' },
    { standNo: '789', township: 'Lenasia', address: 'Opp Clinic, Palm Avenue' },
    { standNo: '101', township: 'Soweto', address: '12 Vilakazi Street' },
    { standNo: '202', township: 'Alexandra', address: '78 London Road' },
    { standNo: '303', township: 'Sandton', address: 'Cnr William Nicol and Sandton Drive' },
    { standNo: '404', township: 'Rosebank', address: '25 Jan Smuts Avenue' },
    { standNo: '505', township: 'Randburg', address: '150 Republic Road' },
  ];

  for (const loc of locations) {
    const location = await prisma.location.upsert({
      where: {
        standNo_township: {
          standNo: loc.standNo,
          township: loc.township,
        },
      },
      update: {},
      create: loc,
    });
    console.log('Created location:', location.standNo, location.township);
  }

  // Create sample jobs
  const sampleLocations = await prisma.location.findMany({ take: 3 });
  const techUsers = await prisma.user.findMany({ where: { role: UserRole.TECHNICIAN } });

  if (sampleLocations.length > 0 && techUsers.length > 0) {
    const jobs = [
      {
        locationId: sampleLocations[0].id,
        title: 'TRFR 15 - Routine Maintenance',
        description: 'Quarterly transformer inspection',
        equipmentType: '250kVA Transformer',
        equipmentId: 'TRFR 15',
        priority: 'NORMAL' as const,
        assignedToId: techUsers[0].id,
        createdById: supervisor.id,
        status: 'ASSIGNED' as const,
      },
      {
        locationId: sampleLocations[1].id,
        title: 'HVC 23 - Fault Investigation',
        description: 'Customer reported power outage',
        equipmentType: 'HVC Unit',
        equipmentId: 'HVC 23',
        priority: 'URGENT' as const,
        assignedToId: techUsers[1].id,
        createdById: supervisor.id,
        status: 'EN_ROUTE' as const,
      },
      {
        locationId: sampleLocations[2].id,
        title: 'MSS 7 - New Installation',
        description: 'Install new mini-substation',
        equipmentType: 'MSS',
        equipmentId: 'MSS 7',
        priority: 'HIGH' as const,
        createdById: admin.id,
        status: 'PENDING' as const,
      },
    ];

    for (const jobData of jobs) {
      const job = await prisma.job.create({
        data: jobData,
      });
      console.log('Created job:', job.title);

      // Create status history
      await prisma.jobStatusHistory.create({
        data: {
          jobId: job.id,
          toStatus: job.status,
          changedById: jobData.createdById,
        },
      });
    }
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
