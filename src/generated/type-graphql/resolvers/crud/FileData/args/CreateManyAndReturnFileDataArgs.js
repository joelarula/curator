"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateManyInput_1 = require("../../../inputs/FileDataCreateManyInput");
let CreateManyAndReturnFileDataArgs = class CreateManyAndReturnFileDataArgs {
};
exports.CreateManyAndReturnFileDataArgs = CreateManyAndReturnFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateManyInput_1.FileDataCreateManyInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], CreateManyAndReturnFileDataArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], CreateManyAndReturnFileDataArgs.prototype, "skipDuplicates", void 0);
exports.CreateManyAndReturnFileDataArgs = CreateManyAndReturnFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateManyAndReturnFileDataArgs);
