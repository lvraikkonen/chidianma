import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const restaurants = [
  {
    name: "楼下卤肉饭",
    area: "公司楼下",
    address: "公司楼下美食广场",
    distanceMinutes: 5,
    cuisine: "简餐",
    priceBand: "25-35",
    tags: ["快", "下饭", "性价比"],
    dish: "卤肉饭加卤蛋",
    reason: "适合赶会，出餐快，周一回血稳。"
  },
  {
    name: "拉面小馆",
    area: "园区东门",
    address: "园区东门 2 楼",
    distanceMinutes: 8,
    cuisine: "日式",
    priceBand: "40-60",
    tags: ["热乎", "面", "雨天"],
    dish: "叉烧拉面",
    reason: "雨天热乎，汤面不容易踩雷。"
  },
  {
    name: "轻食沙拉碗",
    area: "写字楼 B1",
    address: "写字楼 B1",
    distanceMinutes: 6,
    cuisine: "轻食",
    priceBand: "35-55",
    tags: ["清爽", "健康", "快"],
    dish: "鸡胸牛油果碗",
    reason: "热天清爽，下午不容易犯困。"
  },
  {
    name: "泰式打抛饭",
    area: "商业街",
    address: "商业街 1 层",
    distanceMinutes: 12,
    cuisine: "东南亚",
    priceBand: "45-65",
    tags: ["异国", "重口", "下饭"],
    dish: "猪肉打抛饭",
    reason: "周三换口味，微辣比较安全。"
  },
  {
    name: "烧腊双拼饭",
    area: "园区西门",
    address: "园区西门",
    distanceMinutes: 10,
    cuisine: "粤菜",
    priceBand: "38-55",
    tags: ["快", "招牌", "好吃"],
    dish: "烧鸭叉烧双拼",
    reason: "出餐稳定，适合不知道吃什么的时候。"
  },
  {
    name: "小火锅工作餐",
    area: "商场",
    address: "商场 4 楼",
    distanceMinutes: 18,
    cuisine: "火锅",
    priceBand: "60-90",
    tags: ["热乎", "聚餐", "周五"],
    dish: "番茄锅套餐",
    reason: "适合周五开心局，注意排队。"
  }
];

async function main() {
  const teammate = await prisma.teammate.upsert({
    where: { name: "Demo 同事" },
    update: { lastSeenAt: new Date() },
    create: { name: "Demo 同事", lastSeenAt: new Date() }
  });

  for (const item of restaurants) {
    const restaurant = await prisma.restaurant.upsert({
      where: { name: item.name },
      update: {
        area: item.area,
        address: item.address,
        distanceMinutes: item.distanceMinutes,
        cuisine: item.cuisine,
        priceBand: item.priceBand,
        supportsDineIn: true,
        supportsTakeout: true,
        tags: item.tags,
        status: "active"
      },
      create: {
        name: item.name,
        area: item.area,
        address: item.address,
        distanceMinutes: item.distanceMinutes,
        cuisine: item.cuisine,
        priceBand: item.priceBand,
        supportsDineIn: true,
        supportsTakeout: true,
        tags: item.tags,
        status: "active"
      }
    });

    const existingRecommendation = await prisma.recommendation.findFirst({
      where: {
        restaurantId: restaurant.id,
        teammateId: teammate.id,
        dish: item.dish
      }
    });

    if (!existingRecommendation) {
      await prisma.recommendation.create({
        data: {
          restaurantId: restaurant.id,
          teammateId: teammate.id,
          dish: item.dish,
          reason: item.reason,
          weatherTags: item.tags.includes("雨天") ? ["rainy"] : item.tags.includes("清爽") ? ["hot"] : [],
          weekdayTags: item.tags.includes("周五") ? ["friday"] : [],
          moodTags: item.tags
        }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
