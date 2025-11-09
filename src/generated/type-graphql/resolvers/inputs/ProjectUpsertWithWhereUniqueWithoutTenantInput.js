"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpsertWithWhereUniqueWithoutTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateWithoutTenantInput_1 = require("../inputs/ProjectCreateWithoutTenantInput");
const ProjectUpdateWithoutTenantInput_1 = require("../inputs/ProjectUpdateWithoutTenantInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectUpsertWithWhereUniqueWithoutTenantInput = class ProjectUpsertWithWhereUniqueWithoutTenantInput {
};
exports.ProjectUpsertWithWhereUniqueWithoutTenantInput = ProjectUpsertWithWhereUniqueWithoutTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereUniqueInput_1.ProjectWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectWhereUniqueInput_1.ProjectWhereUniqueInput)
], ProjectUpsertWithWhereUniqueWithoutTenantInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateWithoutTenantInput_1.ProjectUpdateWithoutTenantInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectUpdateWithoutTenantInput_1.ProjectUpdateWithoutTenantInput)
], ProjectUpsertWithWhereUniqueWithoutTenantInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateWithoutTenantInput_1.ProjectCreateWithoutTenantInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectCreateWithoutTenantInput_1.ProjectCreateWithoutTenantInput)
], ProjectUpsertWithWhereUniqueWithoutTenantInput.prototype, "create", void 0);
exports.ProjectUpsertWithWhereUniqueWithoutTenantInput = ProjectUpsertWithWhereUniqueWithoutTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpsertWithWhereUniqueWithoutTenantInput", {})
], ProjectUpsertWithWhereUniqueWithoutTenantInput);
