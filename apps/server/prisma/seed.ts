import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashInviteCode } from "../src/services/groups/inviteCodes.js";

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
  const now = new Date();
  const defaultInviteCodeHash = hashInviteCode("LUNCH-2026AA", process.env.SESSION_SECRET ?? "dev-session-secret");
  const defaultOfficeTimezone = process.env.OFFICE_TIMEZONE ?? "Asia/Shanghai";
  const defaultOfficeCity = process.env.OFFICE_CITY ?? "Shanghai";
  const defaultOfficeLatitude = Number(process.env.OFFICE_LATITUDE ?? 31.2304);
  const defaultOfficeLongitude = Number(process.env.OFFICE_LONGITUDE ?? 121.4737);
  const defaultIdentity = await prisma.identity.upsert({
    where: { id: "seed-identity-admin" },
    update: { displayName: "Demo 同事", lastSeenAt: now },
    create: { id: "seed-identity-admin", displayName: "Demo 同事", lastSeenAt: now }
  });

  const defaultGroup = await prisma.lunchGroup.upsert({
    where: { id: "seed-group-default" },
    update: {
      name: "Dev团队",
      subtitle: "干饭小分队",
      inviteCodeHash: defaultInviteCodeHash,
      createdByIdentityId: defaultIdentity.id,
      officeTimezone: defaultOfficeTimezone,
      officeCity: defaultOfficeCity,
      officeLatitude: defaultOfficeLatitude,
      officeLongitude: defaultOfficeLongitude
    },
    create: {
      id: "seed-group-default",
      name: "Dev团队",
      subtitle: "干饭小分队",
      inviteCodeHash: defaultInviteCodeHash,
      createdByIdentityId: defaultIdentity.id,
      officeTimezone: defaultOfficeTimezone,
      officeCity: defaultOfficeCity,
      officeLatitude: defaultOfficeLatitude,
      officeLongitude: defaultOfficeLongitude
    }
  });

  const defaultMembership = await prisma.groupMembership.upsert({
    where: { id: "seed-membership-admin" },
    update: { role: "admin", status: "active", removedAt: null },
    create: {
      id: "seed-membership-admin",
      groupId: defaultGroup.id,
      identityId: defaultIdentity.id,
      role: "admin",
      status: "active"
    }
  });

  await prisma.groupSettings.upsert({
    where: { groupId: defaultGroup.id },
    update: { notificationGroupLabel: defaultGroup.name },
    create: { groupId: defaultGroup.id, notificationGroupLabel: defaultGroup.name }
  });

  await prisma.scoringWeights.upsert({
    where: { groupId: defaultGroup.id },
    update: {},
    create: { groupId: defaultGroup.id }
  });

  const teammate = await prisma.teammate.upsert({
    where: { name: "Demo 同事" },
    update: { lastSeenAt: now },
    create: { name: "Demo 同事", lastSeenAt: now }
  });

  for (const item of restaurants) {
    const restaurantData = {
      groupId: defaultGroup.id,
      area: item.area,
      address: item.address,
      distanceMinutes: item.distanceMinutes,
      cuisine: item.cuisine,
      priceBand: item.priceBand,
      supportsDineIn: true,
      supportsTakeout: true,
      tags: item.tags,
      status: "active" as const,
      createdByMembershipId: defaultMembership.id
    };
    const existingRestaurant = await prisma.restaurant.findFirst({
      where: { groupId: defaultGroup.id, name: item.name, area: item.area }
    });
    const restaurant = existingRestaurant
      ? await prisma.restaurant.update({
          where: { id: existingRestaurant.id },
          data: restaurantData
        })
      : await prisma.restaurant.create({
          data: { ...restaurantData, name: item.name }
        });

    const existingRecommendation = await prisma.recommendation.findFirst({
      where: {
        groupId: defaultGroup.id,
        restaurantId: restaurant.id,
        teammateId: teammate.id,
        dish: item.dish
      }
    });

    const recommendationData = {
      groupId: defaultGroup.id,
      restaurantId: restaurant.id,
      teammateId: teammate.id,
      createdByMembershipId: defaultMembership.id,
      dish: item.dish,
      reason: item.reason,
      weatherTags: item.tags.includes("雨天") ? ["rainy"] : item.tags.includes("清爽") ? ["hot"] : [],
      weekdayTags: item.tags.includes("周五") ? ["friday"] : [],
      moodTags: item.tags
    };

    if (existingRecommendation) {
      await prisma.recommendation.update({
        where: { id: existingRecommendation.id },
        data: recommendationData
      });
    } else {
      await prisma.recommendation.create({
        data: recommendationData
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
