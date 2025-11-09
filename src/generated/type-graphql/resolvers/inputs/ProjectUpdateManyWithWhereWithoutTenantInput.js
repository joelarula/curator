"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateManyWithWhereWithoutTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectScalarWhereInput_1 = require("../inputs/ProjectScalarWhereInput");
const ProjectUpdateManyMutationInput_1 = require("../inputs/ProjectUpdateManyMutationInput");
let ProjectUpdateManyWithWhereWithoutTenantInput = class ProjectUpdateManyWithWhereWithoutTenantInput {
};
exports.ProjectUpdateManyWithWhereWithoutTenantInput = ProjectUpdateManyWithWhereWithoutTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectScalarWhereInput_1.ProjectScalarWhereInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectScalarWhereInput_1.ProjectScalarWhereInput)
], ProjectUpdateManyWithWhereWithoutTenantInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateManyMutationInput_1.ProjectUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectUpdateManyMutationInput_1.ProjectUpdateManyMutationInput)
], ProjectUpdateManyWithWhereWithoutTenantInput.prototype, "data", void 0);
exports.ProjectUpdateManyWithWhereWithoutTenantInput = ProjectUpdateManyWithWhereWithoutTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateManyWithWhereWithoutTenantInput", {})
], ProjectUpdateManyWithWhereWithoutTenantInput);
