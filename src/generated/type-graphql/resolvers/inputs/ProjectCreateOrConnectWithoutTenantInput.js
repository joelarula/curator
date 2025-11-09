"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateOrConnectWithoutTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateWithoutTenantInput_1 = require("../inputs/ProjectCreateWithoutTenantInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectCreateOrConnectWithoutTenantInput = class ProjectCreateOrConnectWithoutTenantInput {
};
exports.ProjectCreateOrConnectWithoutTenantInput = ProjectCreateOrConnectWithoutTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereUniqueInput_1.ProjectWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectWhereUniqueInput_1.ProjectWhereUniqueInput)
], ProjectCreateOrConnectWithoutTenantInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateWithoutTenantInput_1.ProjectCreateWithoutTenantInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectCreateWithoutTenantInput_1.ProjectCreateWithoutTenantInput)
], ProjectCreateOrConnectWithoutTenantInput.prototype, "create", void 0);
exports.ProjectCreateOrConnectWithoutTenantInput = ProjectCreateOrConnectWithoutTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateOrConnectWithoutTenantInput", {})
], ProjectCreateOrConnectWithoutTenantInput);
