"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateNestedManyWithoutProjectInput_1 = require("../inputs/FileDataCreateNestedManyWithoutProjectInput");
const TenantCreateNestedOneWithoutProjectsInput_1 = require("../inputs/TenantCreateNestedOneWithoutProjectsInput");
let ProjectCreateInput = class ProjectCreateInput {
};
exports.ProjectCreateInput = ProjectCreateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ProjectCreateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateNestedOneWithoutProjectsInput_1.TenantCreateNestedOneWithoutProjectsInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantCreateNestedOneWithoutProjectsInput_1.TenantCreateNestedOneWithoutProjectsInput)
], ProjectCreateInput.prototype, "tenant", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateNestedManyWithoutProjectInput_1.FileDataCreateNestedManyWithoutProjectInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCreateNestedManyWithoutProjectInput_1.FileDataCreateNestedManyWithoutProjectInput)
], ProjectCreateInput.prototype, "files", void 0);
exports.ProjectCreateInput = ProjectCreateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateInput", {})
], ProjectCreateInput);
