import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  LISTING_DRAFT_TEXT_MAX,
  type ListingDraftRequest,
} from '@asobeast/shared';
import { ListingQueryDto } from '../../apps/dto/listing-query.dto';

const draftText = (description: string) =>
  ApiPropertyOptional({ maxLength: LISTING_DRAFT_TEXT_MAX, description });

export class ListingDraftDto
  extends ListingQueryDto
  implements ListingDraftRequest
{
  @draftText('The draft title. Omitted keeps the stored title.')
  @IsOptional()
  @IsString()
  @MaxLength(LISTING_DRAFT_TEXT_MAX)
  title?: string;

  @draftText('The draft subtitle. App Store only.')
  @IsOptional()
  @IsString()
  @MaxLength(LISTING_DRAFT_TEXT_MAX)
  subtitle?: string;

  @draftText(
    'The draft keyword field of the localization read, comma separated. App Store only.',
  )
  @IsOptional()
  @IsString()
  @MaxLength(LISTING_DRAFT_TEXT_MAX)
  keywordField?: string;

  @draftText('The draft short description. Google Play only.')
  @IsOptional()
  @IsString()
  @MaxLength(LISTING_DRAFT_TEXT_MAX)
  shortDescription?: string;

  @draftText('The draft description. Omitted keeps the stored description.')
  @IsOptional()
  @IsString()
  @MaxLength(LISTING_DRAFT_TEXT_MAX)
  description?: string;
}
