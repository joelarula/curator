"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateNestedManyWithoutTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateManyTenantInputEnvelope_1 = require("../inputs/ProjectCreateManyTenantInputEnvelope");
const ProjectCreateOrConnectWithoutTenantInput_1 = require("../inputs/ProjectCreateOrConnectWithoutTenantInput");
const ProjectCreateWithoutTenantInput_1 = require("../inputs/ProjectCreateWithoutTenantInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectCreateNestedManyWithoutTenantInput = class ProjectCreateNestedManyWithoutTenantInput {
};
exports.ProjectCreateNestedManyWithoutTenantInput = ProjectCreateNestedManyWithoutTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectCreateWithoutTenantInput_1.ProjectCreateWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectCreateNestedManyWithoutTenantInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectCreateOrConnectWithoutTenantInput_1.ProjectCreateOrConnectWithoutTenantInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectCreateNestedManyWithoutTenantInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateManyTenantInputEnvelope_1.ProjectCreateManyTenantInputEnvelope, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateManyTenantInputEnvelope_1.ProjectCreateManyTenantInputEnvelope)
], ProjectCreateNestedManyWithoutTenantInput.prototype, "createMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereUniqueInput_1.ProjectWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectCreateNestedManyWithoutTenantInput.prototype, "connect", void 0);
exports.ProjectCreateNestedManyWithoutTenantInput = ProjectCreateNestedManyWithoutTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateNestedManyWithoutTenantInput", {})
], ProjectCreateNestedManyWithoutTenantInput);
