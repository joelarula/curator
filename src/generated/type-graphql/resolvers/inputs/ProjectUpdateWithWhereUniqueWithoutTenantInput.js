"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateWithWhereUniqueWithoutTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectUpdateWithoutTenantInput_1 = require("../inputs/ProjectUpdateWithoutTenantInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectUpdateWithWhereUniqueWithoutTenantInput = class ProjectUpdateWithWhereUniqueWithoutTenantInput {
};
exports.ProjectUpdateWithWhereUniqueWithoutTenantInput = ProjectUpdateWithWhereUniqueWithoutTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereUniqueInput_1.ProjectWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectWhereUniqueInput_1.ProjectWhereUniqueInput)
], ProjectUpdateWithWhereUniqueWithoutTenantInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateWithoutTenantInput_1.ProjectUpdateWithoutTenantInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectUpdateWithoutTenantInput_1.ProjectUpdateWithoutTenantInput)
], ProjectUpdateWithWhereUniqueWithoutTenantInput.prototype, "data", void 0);
exports.ProjectUpdateWithWhereUniqueWithoutTenantInput = ProjectUpdateWithWhereUniqueWithoutTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateWithWhereUniqueWithoutTenantInput", {})
], ProjectUpdateWithWhereUniqueWithoutTenantInput);
