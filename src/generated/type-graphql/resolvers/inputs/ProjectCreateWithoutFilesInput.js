"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateWithoutFilesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateNestedOneWithoutProjectsInput_1 = require("../inputs/TenantCreateNestedOneWithoutProjectsInput");
let ProjectCreateWithoutFilesInput = class ProjectCreateWithoutFilesInput {
};
exports.ProjectCreateWithoutFilesInput = ProjectCreateWithoutFilesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ProjectCreateWithoutFilesInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateWithoutFilesInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateWithoutFilesInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateNestedOneWithoutProjectsInput_1.TenantCreateNestedOneWithoutProjectsInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantCreateNestedOneWithoutProjectsInput_1.TenantCreateNestedOneWithoutProjectsInput)
], ProjectCreateWithoutFilesInput.prototype, "tenant", void 0);
exports.ProjectCreateWithoutFilesInput = ProjectCreateWithoutFilesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateWithoutFilesInput", {})
], ProjectCreateWithoutFilesInput);
