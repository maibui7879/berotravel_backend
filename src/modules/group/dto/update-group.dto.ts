import { PartialType } from '@nestjs/swagger';
import { CreateGroupDto } from './group.dto';

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}
