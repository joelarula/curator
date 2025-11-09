"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateManyInput_1 = require("../../../inputs/FileDataCreateManyInput");
let CreateManyFileDataArgs = class CreateManyFileDataArgs {
};
exports.CreateManyFileDataArgs = CreateManyFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateManyInput_1.FileDataCreateManyInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], CreateManyFileDataArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], CreateManyFileDataArgs.prototype, "skipDuplicates", void 0);
exports.CreateManyFileDataArgs = CreateManyFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateManyFileDataArgs);
