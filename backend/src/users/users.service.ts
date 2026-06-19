import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdatePreferencesDto, UpdateProfileDto } from './users.dto';

export interface MeResponse {
  id: string;
  email: string | null;
  roles: string[];
  profile: {
    displayName: string | null;
    graduationYear: number | null;
    campusId: string | null;
    onboardingCompleted: boolean;
    consentAt: string | null;
  };
  preferences: { searchRadiusMiles: number; notificationsEnabled: boolean };
  interests: string[];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        preferences: true,
        roles: true,
        categoryPreferences: { include: { category: true } },
      },
    });

    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role),
      profile: {
        displayName: user.profile?.displayName ?? null,
        graduationYear: user.profile?.graduationYear ?? null,
        campusId: user.profile?.campusId ?? null,
        onboardingCompleted: user.profile?.onboardingCompleted ?? false,
        consentAt: user.profile?.consentAt?.toISOString() ?? null,
      },
      preferences: {
        searchRadiusMiles: user.preferences?.searchRadiusMiles ?? 5,
        notificationsEnabled: user.preferences?.notificationsEnabled ?? false,
      },
      interests: user.categoryPreferences.map((p) => p.category.slug),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<MeResponse> {
    if (dto.campusId) {
      const campus = await this.prisma.campus.findUnique({ where: { id: dto.campusId } });
      if (!campus) throw new BadRequestException('Unknown campusId');
    }

    let categoryIds: string[] | undefined;
    if (dto.interests) {
      const cats = await this.prisma.category.findMany({
        where: { slug: { in: dto.interests } },
        select: { id: true, slug: true },
      });
      if (cats.length !== new Set(dto.interests).size) {
        throw new BadRequestException('One or more interest slugs are unknown');
      }
      categoryIds = cats.map((c) => c.id);
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userProfile.findUnique({ where: { userId } });
      const completing = dto.onboardingCompleted === true && !existing?.onboardingCompleted;
      await tx.userProfile.update({
        where: { userId },
        data: {
          displayName: dto.displayName,
          graduationYear: dto.graduationYear,
          campusId: dto.campusId,
          onboardingCompleted: dto.onboardingCompleted,
          // Stamp consent the first time onboarding completes.
          consentAt: completing && !existing?.consentAt ? new Date() : undefined,
        },
      });

      if (categoryIds) {
        await tx.userCategoryPreference.deleteMany({ where: { userId } });
        if (categoryIds.length > 0) {
          await tx.userCategoryPreference.createMany({
            data: categoryIds.map((categoryId) => ({ userId, categoryId })),
          });
        }
      }
    });

    return this.getMe(userId);
  }

  async getPreferences(userId: string): Promise<MeResponse['preferences']> {
    const prefs = await this.prisma.userPreferences.findUniqueOrThrow({ where: { userId } });
    return {
      searchRadiusMiles: prefs.searchRadiusMiles,
      notificationsEnabled: prefs.notificationsEnabled,
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<MeResponse['preferences']> {
    const prefs = await this.prisma.userPreferences.update({
      where: { userId },
      data: {
        searchRadiusMiles: dto.searchRadiusMiles,
        notificationsEnabled: dto.notificationsEnabled,
      },
    });
    return {
      searchRadiusMiles: prefs.searchRadiusMiles,
      notificationsEnabled: prefs.notificationsEnabled,
    };
  }

  /** Soft-delete the account. A worker job purges PII later (Phase 7+). */
  async deleteMe(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  }
}
