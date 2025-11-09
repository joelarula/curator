"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateNestedOneWithoutFilesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateOrConnectWithoutFilesInput_1 = require("../inputs/ProjectCreateOrConnectWithoutFilesInput");
const ProjectCreateWithoutFilesInput_1 = require("../inputs/ProjectCreateWithoutFilesInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectCreateNestedOneWithoutFilesInput = class ProjectCreateNestedOneWithoutFilesInput {
};
exports.ProjectCreateNestedOneWithoutFilesInput = ProjectCreateNestedOneWithoutFilesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput)
], ProjectCreateNestedOneWithoutFilesInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateOrConnectWithoutFilesInput_1.ProjectCreateOrConnectWithoutFilesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateOrConnectWithoutFilesInput_1.ProjectCreateOrConnectWithoutFilesInput)
], ProjectCreateNestedOneWithoutFilesInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereUniqueInput_1.ProjectWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectWhereUniqueInput_1.ProjectWhereUniqueInput)
], ProjectCreateNestedOneWithoutFilesInput.prototype, "connect", void 0);
exports.ProjectCreateNestedOneWithoutFilesInput = ProjectCreateNestedOneWithoutFilesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateNestedOneWithoutFilesInput", {})
], ProjectCreateNestedOneWithoutFilesInput);
