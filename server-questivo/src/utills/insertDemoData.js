const { PrismaClient } = require("@prisma/client");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting the seeding process...");

  // 1. CLEANUP EXISTING DATA (cascade takes care of related deletes)
  console.log("🧹 Cleaning up the database...");
  await prisma.wishlist.deleteMany();
  await prisma.customer_order_product.deleteMany();
  await prisma.customer_order.deleteMany();
  await prisma.image.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  console.log("✅ Database cleaned.");

  // 2. SEED CATEGORIES
  console.log("🌱 Seeding categories...");
  const demoCategoriesData = [
    { name: "Animated 3D Posters" },
    { name: "Anime Metal Posters" },
    { name: "Anime Lover Collection" },
    { name: "Key Chains" },
    { name: "My Hero Academia" },
    { name: "Oversized Titans" },
    { name: "Ragnarok Regular" },
    { name: "Sanatani Collection" },
    { name: "Super Hero Collection" },
    { name: "Tokyo Revengers Regular" },
    { name: "Video Game Posters" },
    { name: "General Collection" },
  ];
  await prisma.category.createMany({ data: demoCategoriesData });
  const createdCategories = await prisma.category.findMany();
  console.log(`✅ ${createdCategories.length} categories seeded.`);

  // 3. SEED USERS
  console.log("🌱 Seeding users...");
  const rawUsers = [
    { email: "ajay@example.com", password: "Password@123", role: "admin" },
    { email: "user@example.com", password: "Password@123", role: "user" },
  ];

  const createdUsers = [];
  for (const userData of rawUsers) {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
      },
    });
    createdUsers.push(user);
    console.log(`✅ User seeded: ${user.email}`);
  }

  // 4. SEED PRODUCTS & IMAGES
  console.log("🌱 Seeding products and images...");
  const assetArrays = {
    "Animated 3D Posters": [
      "assets/Animated_3d_poster/asset_34.jpeg",
      "assets/Animated_3d_poster/asset_35.jpeg",
      "assets/Animated_3d_poster/asset_36.jpeg",
      "assets/Animated_3d_poster/asset_37.jpeg",
      "assets/Animated_3d_poster/asset_38.jpeg",
      "assets/Animated_3d_poster/asset_39.jpeg",
      "assets/Animated_3d_poster/asset_40.jpeg",
      "assets/Animated_3d_poster/asset_41.jpeg",
      "assets/Animated_3d_poster/asset_42.jpeg",
      "assets/Animated_3d_poster/asset_43.jpeg",
      "assets/Animated_3d_poster/asset_44.jpeg",
      "assets/Animated_3d_poster/asset_45.jpeg",
      "assets/Animated_3d_poster/asset_46.jpeg",
      "assets/Animated_3d_poster/asset_47.jpeg",
      "assets/Animated_3d_poster/asset_48.jpeg",
      "assets/Animated_3d_poster/asset_49.jpeg",
      "assets/Animated_3d_poster/asset_50.jpeg",
      "assets/Animated_3d_poster/asset_51.jpeg",
      "assets/Animated_3d_poster/asset_52.jpeg",
    ],
    "Anime Lover Collection": [
      "assets/anime_lover/asset_56.jpeg",
      "assets/anime_lover/asset_57.jpeg",
      "assets/anime_lover/asset_58.jpeg",
      "assets/anime_lover/asset_59.jpeg",
      "assets/anime_lover/asset_60.jpeg",
      "assets/anime_lover/asset_61.jpeg",
      "assets/anime_lover/asset_62.jpeg",
      "assets/anime_lover/asset_63.jpeg",
      "assets/anime_lover/asset_64.jpeg",
      "assets/anime_lover/asset_65.jpeg",
      "assets/anime_lover/asset_66.jpeg",
      "assets/anime_lover/asset_67.jpeg",
      "assets/anime_lover/asset_68.jpeg",
      "assets/anime_lover/asset_69.jpeg",
      "assets/anime_lover/asset_81.jpeg",
      "assets/anime_lover/asset_82.jpeg",
      "assets/anime_lover/asset_83.jpeg",
      "assets/anime_lover/asset_84.jpeg",
      "assets/anime_lover/asset_85.jpeg",
    ],
    "Anime Metal Posters": [
      "assets/anime_poster/asset_53.jpeg",
      "assets/anime_poster/asset_54.jpeg",
      "assets/anime_poster/asset_55.jpeg",
      "assets/anime_poster/asset_56.jpeg",
      "assets/anime_poster/asset_57.jpeg",
      "assets/anime_poster/asset_58.jpeg",
      "assets/anime_poster/asset_59.jpeg",
      "assets/anime_poster/asset_60.jpeg",
      "assets/anime_poster/asset_61.jpeg",
      "assets/anime_poster/asset_67.jpeg",
      "assets/anime_poster/asset_100.jpeg",
      "assets/anime_poster/asset_101.jpeg",
      "assets/anime_poster/asset_102.jpeg",
      "assets/anime_poster/asset_103.jpeg",
      "assets/anime_poster/asset_104.jpeg",
      "assets/anime_poster/asset_105.jpeg",
      "assets/anime_poster/asset_106.jpeg",
      "assets/anime_poster/asset_107.jpeg",
      "assets/anime_poster/asset_108.jpeg",
      "assets/anime_poster/asset_109.jpeg",
      "assets/anime_poster/asset_110.jpeg",
      "assets/anime_poster/asset_111.jpeg",
      "assets/anime_poster/asset_112.jpeg",
      "assets/anime_poster/asset_113.jpeg",
      "assets/anime_poster/asset_114.jpeg",
      "assets/anime_poster/asset_115.jpeg",
      "assets/anime_poster/asset_116.jpeg",
    ],
    "Key Chains": [
      "assets/keychains/asset_70.jpeg",
      "assets/keychains/asset_71.jpeg",
      "assets/keychains/asset_72.jpeg",
      "assets/keychains/asset_73.jpeg",
      "assets/keychains/asset_74.jpeg",
      "assets/keychains/asset_75.jpeg",
      "assets/keychains/asset_76.jpeg",
      "assets/keychains/asset_77.jpeg",
      "assets/keychains/asset_78.jpeg",
      "assets/keychains/asset_79.jpeg",
      "assets/keychains/asset_80.jpeg",
    ],
    "My Hero Academia": [
      "assets/my_Hero_regular/asset_153.jpeg",
      "assets/my_Hero_regular/asset_154.jpeg",
      "assets/my_Hero_regular/asset_155.jpeg",
      "assets/my_Hero_regular/asset_156.jpeg",
      "assets/my_Hero_regular/asset_157.jpeg",
      "assets/my_Hero_regular/asset_158.jpeg",
      "assets/my_Hero_regular/asset_159.jpeg",
      "assets/my_Hero_regular/asset_160.jpeg",
      "assets/my_Hero_regular/asset_161.jpeg",
      "assets/my_Hero_regular/asset_162.jpeg",
      "assets/my_Hero_regular/asset_163.jpeg",
      "assets/my_Hero_regular/asset_164.jpeg",
      "assets/my_Hero_regular/asset_165.jpeg",
      "assets/my_Hero_regular/asset_166.jpeg",
      "assets/my_Hero_regular/asset_167.jpeg",
    ],
    "Oversized Titans": [
      "assets/oversized_titans/asset_139.jpeg",
      "assets/oversized_titans/asset_140.jpeg",
      "assets/oversized_titans/asset_141.jpeg",
      "assets/oversized_titans/asset_142.jpeg",
      "assets/oversized_titans/asset_143.jpeg",
      "assets/oversized_titans/asset_144.jpeg",
      "assets/oversized_titans/asset_145.jpeg",
      "assets/oversized_titans/asset_146.jpeg",
      "assets/oversized_titans/asset_147.jpeg",
      "assets/oversized_titans/asset_148.jpeg",
      "assets/oversized_titans/asset_149.jpeg",
      "assets/oversized_titans/asset_150.jpeg",
      "assets/oversized_titans/asset_151.jpeg",
      "assets/oversized_titans/asset_152.jpeg",
    ],
    "Ragnarok Regular": [
      "assets/regular_ragnnarok/asset_186.jpeg",
      "assets/regular_ragnnarok/asset_187.jpeg",
      "assets/regular_ragnnarok/asset_188.jpeg",
      "assets/regular_ragnnarok/asset_189.jpeg",
      "assets/regular_ragnnarok/asset_190.jpeg",
      "assets/regular_ragnnarok/asset_191.jpeg",
      "assets/regular_ragnnarok/asset_192.jpeg",
    ],
    "Sanatani Collection": [
      "assets/sanatni/asset_193.jpeg",
      "assets/sanatni/asset_194.jpeg",
      "assets/sanatni/asset_195.jpeg",
      "assets/sanatni/asset_196.jpeg",
      "assets/sanatni/asset_197.jpeg",
      "assets/sanatni/asset_198.jpeg",
      "assets/sanatni/asset_199.jpeg",
    ],
    "Super Hero Collection": [
      "assets/super_hero/asset_49.jpeg",
      "assets/super_hero/asset_50.jpeg",
      "assets/super_hero/asset_51.jpeg",
      "assets/super_hero/asset_52.jpeg",
      "assets/super_hero/asset_53.jpeg",
      "assets/super_hero/asset_54.jpeg",
      "assets/super_hero/asset_55.jpeg",
    ],
    "Tokyo Revengers Regular": [
      "assets/tokyo_regular/asset_168.jpeg",
      "assets/tokyo_regular/asset_169.jpeg",
      "assets/tokyo_regular/asset_170.jpeg",
      "assets/tokyo_regular/asset_171.jpeg",
      "assets/tokyo_regular/asset_172.jpeg",
      "assets/tokyo_regular/asset_173.jpeg",
      "assets/tokyo_regular/asset_174.jpeg",
      "assets/tokyo_regular/asset_175.jpeg",
      "assets/tokyo_regular/asset_176.jpeg",
      "assets/tokyo_regular/asset_177.jpeg",
      "assets/tokyo_regular/asset_178.jpeg",
      "assets/tokyo_regular/asset_179.jpeg",
      "assets/tokyo_regular/asset_180.jpeg",
      "assets/tokyo_regular/asset_181.jpeg",
      "assets/tokyo_regular/asset_182.jpeg",
      "assets/tokyo_regular/asset_183.jpeg",
      "assets/tokyo_regular/asset_184.jpeg",
      "assets/tokyo_regular/asset_185.jpeg",
    ],
    "Video Game Posters": [
      "assets/video_game/asset_118.jpeg",
      "assets/video_game/asset_119.jpeg",
      "assets/video_game/asset_120.jpeg",
      "assets/video_game/asset_121.jpeg",
      "assets/video_game/asset_122.jpeg",
      "assets/video_game/asset_123.jpeg",
      "assets/video_game/asset_124.jpeg",
      "assets/video_game/asset_125.jpeg",
      "assets/video_game/asset_126.jpeg",
      "assets/video_game/asset_127.jpeg",
      "assets/video_game/asset_128.jpeg",
      "assets/video_game/asset_129.jpeg",
      "assets/video_game/asset_130.jpeg",
      "assets/video_game/asset_131.jpeg",
      "assets/video_game/asset_132.jpeg",
      "assets/video_game/asset_133.jpeg",
    ],
    "General Collection": [
      "assets/asset_0.jpeg",
      "assets/asset_1.jpeg",
      "assets/asset_2.png",
      "assets/asset_3.jpeg",
      "assets/asset_4.jpeg",
      "assets/asset_5.jpeg",
      "assets/asset_6.jpeg",
      "assets/asset_7.jpeg",
      "assets/asset_8.jpeg",
      "assets/asset_9.jpeg",
      "assets/asset_10.jpeg",
      "assets/asset_11.jpeg",
      "assets/asset_12.jpeg",
      "assets/asset_13.jpeg",
      "assets/asset_14.jpeg",
      "assets/asset_15.jpeg",
      "assets/asset_17.jpeg",
      "assets/asset_18.jpeg",
      "assets/asset_19.jpeg",
      "assets/asset_20.jpeg",
      "assets/asset_21.jpeg",
      "assets/asset_22.jpeg",
      "assets/asset_23.jpeg",
      "assets/asset_24.jpeg",
      "assets/asset_25.jpeg",
      "assets/asset_26.jpeg",
      "assets/asset_27.jpeg",
      "assets/asset_28.jpeg",
      "assets/asset_29.jpeg",
      "assets/asset_30.jpeg",
      "assets/asset_31.png",
      "assets/asset_32.png",
      "assets/asset_33.png",
      "assets/asset_34.png",
      "assets/asset_134.png",
      "assets/asset_135.jpeg",
      "assets/asset_136.svg",
      "assets/asset_137.svg",
      "assets/asset_138.svg",
      "assets/asset_139.svg",
      "assets/asset_140.svg",
      "assets/asset_141.svg",
      "assets/asset_142.svg",
      "assets/asset_143.svg",
      "assets/asset_144.svg",
      "assets/asset_145.svg",
      "assets/asset_146.svg",
      "assets/asset_147.svg",
      "assets/asset_148.svg",
      "assets/asset_149.svg",
    ],
  };

  const allProducts = [];
  for (const [categoryName, images] of Object.entries(assetArrays)) {
    const category = createdCategories.find((c) => c.name === categoryName);
    if (!category) continue;

    for (let i = 0; i < images.length; i++) {
      const cleanedImagePath = images[i].replace(/^\/+/, "");
      const title = `${categoryName} - ${
        cleanedImagePath.split("/").pop().split(".")[0]
      }`;
    const githubUrl = `https://raw.githubusercontent.com/ajaykumarsaini231/server/refs/heads/main/public/${cleanedImagePath}`;

      const product = await prisma.product.create({
        data: {
          title,
          slug: `${title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}-${uuidv4().slice(0, 6)}`,
          mainImage: githubUrl,
          price: Math.floor(Math.random() * 500) + 299,
          rating: Math.floor(Math.random() * 3) + 3,
          description: `A high-quality product from the ${categoryName} collection.`,
          manufacturer: "FanMerch Co.",
          inStock: Math.floor(Math.random() * 100),
          categoryId: category.id,
           images: {
          create: [
            {
              image: githubUrl, // chnage to cleanedImagePath when you are on your local machine..
            },
          ],
        },
        },
      });

      allProducts.push(product);
    }
  }
  console.log(`✅ ${allProducts.length} products seeded.`);

  // 5. SEED ORDERS
  console.log("🌱 Seeding customer orders...");
  if (allProducts.length > 2 && createdUsers.length > 0) {
    for (let i = 0; i < 3; i++) {
      const user = createdUsers[i % createdUsers.length];
      const product1 =
        allProducts[Math.floor(Math.random() * allProducts.length)];
      const product2 =
        allProducts[Math.floor(Math.random() * allProducts.length)];
      const qty1 = Math.floor(Math.random() * 3) + 1;
      const qty2 = Math.floor(Math.random() * 2) + 1;

      await prisma.customer_order.create({
  data: {
    userId: user.id, // ✅ Important: link order to user
    name: user.email.split("@")[0],
    lastname: "User",
    phone: "9876543210",
    email: user.email,
    company: "Demo Company Pvt Ltd",
    adress: "123 Main St",
    apartment: "Apt 101",
    postalCode: "110001",
    city: "New Delhi",
    country: "India",
    status: ["Pending", "Shipped", "Delivered"][i],
    total: product1.price * qty1 + product2.price * qty2,
    products: {
      create: [
        { productId: product1.id, quantity: qty1 },
        { productId: product2.id, quantity: qty2 },
      ],
    },
  },
      });
    }
    console.log("✅ 3 sample orders seeded.");
  }

  // 6. SEED ADDRESSES
console.log("🌱 Seeding addresses...");
if (createdUsers.length > 0) {
  for (const user of createdUsers) {
    await prisma.address.createMany({
      data: [
        {
          userId: user.id,
          name: user.email.split("@")[0],
          lastname: "Doe",
          address: "123 Main Street",
          city: "New Delhi",
          postalCode: "110001",
          country: "India",
          phone: "9876543210",
          isDefault: true,
        },
        {
          userId: user.id,
          name: user.email.split("@")[0],
          lastname: "Doe",
          address: "45 Park Avenue",
          city: "Mumbai",
          postalCode: "400001",
          country: "India",
          phone: "9998887776",
          isDefault: false,
        },
      ],
    });
    console.log(`✅ Dummy addresses seeded for user: ${user.email}`);
  }
}

  // 6. SEED WISHLISTS
  // console.log("🌱 Seeding wishlists...");
  // 6. SEED WISHLISTS
  console.log("🌱 Seeding wishlists...");
  if (allProducts.length > 4 && createdUsers.length > 0) {
    for (let i = 0; i < 5; i++) {
      const user =
        createdUsers[Math.floor(Math.random() * createdUsers.length)];
      const product =
        allProducts[Math.floor(Math.random() * allProducts.length)];

      await prisma.wishlist.upsert({
        where: {
          // 👇 this now works because we add @@unique([userId, productId]) in schema
          userId_productId: {
            userId: user.id,
            productId: product.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          productId: product.id,
        },
      });
    }
    console.log("✅ Sample wishlist items seeded.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    console.log("🎉 Seeding finished. Disconnecting Prisma Client.");
    await prisma.$disconnect();
  });
