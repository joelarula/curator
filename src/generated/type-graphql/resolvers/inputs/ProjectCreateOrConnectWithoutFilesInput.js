"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateOrConnectWithoutFilesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateWithoutFilesInput_1 = require("../inputs/ProjectCreateWithoutFilesInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectCreateOrConnectWithoutFilesInput = class ProjectCreateOrConnectWithoutFilesInput {
};
exports.ProjectCreateOrConnectWithoutFilesInput = ProjectCreateOrConnectWithoutFilesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereUniqueInput_1.ProjectWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectWhereUniqueInput_1.ProjectWhereUniqueInput)
], ProjectCreateOrConnectWithoutFilesInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput)
], ProjectCreateOrConnectWithoutFilesInput.prototype, "create", void 0);
exports.ProjectCreateOrConnectWithoutFilesInput = ProjectCreateOrConnectWithoutFilesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateOrConnectWithoutFilesInput", {})
], ProjectCreateOrConnectWithoutFilesInput);
