"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateManyWithoutTenantNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateManyTenantInputEnvelope_1 = require("../inputs/ProjectCreateManyTenantInputEnvelope");
const ProjectCreateOrConnectWithoutTenantInput_1 = require("../inputs/ProjectCreateOrConnectWithoutTenantInput");
const ProjectCreateWithoutTenantInput_1 = require("../inputs/ProjectCreateWithoutTenantInput");
const ProjectScalarWhereInput_1 = require("../inputs/ProjectScalarWhereInput");
const ProjectUpdateManyWithWhereWithoutTenantInput_1 = require("../inputs/ProjectUpdateManyWithWhereWithoutTenantInput");
const ProjectUpdateWithWhereUniqueWithoutTenantInput_1 = require("../inputs/ProjectUpdateWithWhereUniqueWithoutTenantInput");
const ProjectUpsertWithWhereUniqueWithoutTenantInput_1 = require("../inputs/ProjectUpsertWithWhereUniqueWithoutTenantInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectUpdateManyWithoutTenantNestedInput = class ProjectUpdateManyWithoutTenantNestedInput {
};
exports.ProjectUpdateManyWithoutTenantNestedInput = ProjectUpdateManyWithoutTenantNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectCreateWithoutTenantInput_1.ProjectCreateWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectCreateOrConnectWithoutTenantInput_1.ProjectCreateOrConnectWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectUpsertWithWhereUniqueWithoutTenantInput_1.ProjectUpsertWithWhereUniqueWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "upsert", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateManyTenantInputEnvelope_1.ProjectCreateManyTenantInputEnvelope, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateManyTenantInputEnvelope_1.ProjectCreateManyTenantInputEnvelope)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "createMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereUniqueInput_1.ProjectWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "set", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereUniqueInput_1.ProjectWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "disconnect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereUniqueInput_1.ProjectWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "delete", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereUniqueInput_1.ProjectWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectUpdateWithWhereUniqueWithoutTenantInput_1.ProjectUpdateWithWhereUniqueWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectUpdateManyWithWhereWithoutTenantInput_1.ProjectUpdateManyWithWhereWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "updateMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectScalarWhereInput_1.ProjectScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectUpdateManyWithoutTenantNestedInput.prototype, "deleteMany", void 0);
exports.ProjectUpdateManyWithoutTenantNestedInput = ProjectUpdateManyWithoutTenantNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateManyWithoutTenantNestedInput", {})
], ProjectUpdateManyWithoutTenantNestedInput);
